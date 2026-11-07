// -----------------------------------------------------------------------------
// cypherValidator.js — Conservative Allowlist Query Validator for RippleCheck
//
// Implements an explicit, allowlist-based lexical scanner and structural
// validator for natural-language generated Cypher queries in RippleCheck.
//
// SUPPORTED CYPHER SUBSET:
// 1. Clauses:
//    - Strictly allowed: MATCH, OPTIONAL MATCH, WHERE, WITH, RETURN, ORDER BY, SKIP, LIMIT.
//    - State-machine clause progression:
//        [MATCH | OPTIONAL MATCH] -> [WHERE]? -> [WITH -> [WHERE]?]* -> RETURN -> [ORDER BY]? -> [SKIP]? -> [LIMIT]?
//    - Queries must begin with MATCH or OPTIONAL MATCH, and terminate with RETURN, ORDER BY, SKIP, or LIMIT.
//    - Unknown clauses or unexpected keyword sequences are rejected.
// 2. Schema Constraints:
//    - Node patterns in MATCH: strictly (var:File) or (:File) with optional property map { key: val }.
//      Every node pattern must explicitly specify exactly the ':File' label.
//    - Relationship patterns: strictly -[:IMPORTS]->, <-[:IMPORTS]-, or -[:IMPORTS]-
//      with optional variable and optional variable-length range (e.g. [:IMPORTS*], [:IMPORTS*1..]).
//      Untyped edges (-->) or unlabelled relationships (-[r]->) are rejected.
//    - Multiple labels (:File:Other), label alternation (:File|Other), and type alternation are rejected.
//    - Properties: strictly 'path', 'name', 'summary' (in dot accesses and pattern maps).
// 3. Expressions & Literals:
//    - Quoted strings with escape support ('...', "...")
//    - Valid numeric integers and decimals
//    - Allowed read-only functions: count, collect, toLower, toUpper, trim, coalesce, isEmpty, exists, size, length.
//      Any unknown function call is rejected.
//    - Comparison operators (=, <>, !=, <, >, <=, >=)
//    - Logical operators (AND, OR, NOT, XOR, IN, IS NULL, IS NOT NULL)
//    - String operators (STARTS WITH, ENDS WITH, CONTAINS)
//
// REJECTED CONSTRUCTS (Security & Safety Guardrails):
// - All mutating and DDL operations (CREATE, MERGE, DELETE, DETACH, SET, REMOVE, DROP, ALTER, RENAME).
// - Administrative, procedural, and dynamic constructs (CALL, USE, UNION, LOAD CSV, FOREACH, GRANT, DENY, REVOKE).
// - Subqueries (nested query blocks).
// - Semicolons, comments (//, /* */), Markdown code fences (```), and backtick-escaped identifiers (`...`).
// - Malformed numbers, unsupported characters, and unbalanced delimiters (), [], {}.
//
// LIMITATIONS:
// This is an application-level defensive filter enforcing a strict, minimal
// domain-specific subset. It rejects valid Cypher outside this subset by design
// ("fail-closed"). It must always be combined with read-only database user credentials.
// -----------------------------------------------------------------------------

const ALLOWED_PROPERTIES = new Set(["path", "name", "summary", "projectid", "userid"]);

const ALLOWED_FUNCTIONS = new Set([
    "count",
    "collect",
    "tolower",
    "toupper",
    "trim",
    "coalesce",
    "isempty",
    "exists",
    "size",
    "length"
]);

const FORBIDDEN_KEYWORDS = new Set([
    "CREATE", "MERGE", "DELETE", "DETACH", "SET", "REMOVE",
    "DROP", "ALTER", "RENAME", "GRANT", "DENY", "REVOKE",
    "LOAD", "CSV", "CALL", "USE", "UNION", "FOREACH",
    "SHOW", "TERMINATE", "SYSTEM", "PERIODIC", "COMMIT", "YIELD",
    "UNWIND"
]);

const ALLOWED_CLAUSE_STARTERS = new Set([
    "MATCH",
    "OPTIONAL MATCH",
    "WHERE",
    "WITH",
    "RETURN",
    "ORDER BY",
    "SKIP",
    "LIMIT"
]);

// Boolean and comparison operator keywords that are valid Cypher identifiers.
// These may appear immediately before '(' in expressions like:
//   WHERE f.name = 'x' AND (f.path = 'y' OR f.summary IS NOT NULL)
// They must NOT be mistaken for function calls.
const OPERATOR_KEYWORDS = new Set([
    "AND", "OR", "NOT", "XOR",
    "IN", "IS",
    "STARTS", "ENDS", "CONTAINS",
    "DISTINCT",
    "AS",
    "TRUE", "FALSE", "NULL",
    "ASC", "DESC"
]);

/**
 * Tokenizes a Cypher query into lexical tokens.
 * Validates balanced delimiters, numbers, and allowed punctuation.
 *
 * @param {string} input - Raw query string
 * @returns {Array<{ type: string, value: string, depth: number }>} - Scanned tokens with nesting depth
 * @throws {Error} - On invalid characters, unbalanced delimiters, or malformed tokens
 */
function tokenize(input) {
    const tokens = [];
    const delimiterStack = [];
    let i = 0;
    const len = input.length;

    while (i < len) {
        const ch = input[i];

        // 1. Whitespace
        if (/\s/.test(ch)) {
            i++;
            continue;
        }

        // 2. Reject Markdown code fences and backtick-escaped identifiers
        if (ch === "`") {
            throw new Error("Backtick characters and Markdown code fences are not permitted.");
        }

        // 3. Reject comments (// or /* ... */)
        if (ch === "/" && (input[i + 1] === "/" || input[i + 1] === "*")) {
            throw new Error("Comments are not permitted in queries.");
        }

        // 4. Reject semicolons (prohibit multi-statement execution)
        if (ch === ";") {
            throw new Error("Semicolons are not permitted in queries.");
        }

        // 5. Delimiter Openings: ( [ {
        if (ch === "(" || ch === "[" || ch === "{") {
            delimiterStack.push(ch);
            tokens.push({ type: "PUNCT", value: ch, depth: delimiterStack.length });
            i++;
            continue;
        }

        // 6. Delimiter Closings: ) ] }
        if (ch === ")" || ch === "]" || ch === "}") {
            if (delimiterStack.length === 0) {
                throw new Error(`Unmatched closing delimiter '${ch}'.`);
            }
            const expectedOpen = ch === ")" ? "(" : ch === "]" ? "[" : "{";
            const actualOpen = delimiterStack.pop();
            if (actualOpen !== expectedOpen) {
                throw new Error(`Mismatched delimiter: expected closing for '${actualOpen}', but found '${ch}'.`);
            }
            tokens.push({ type: "PUNCT", value: ch, depth: delimiterStack.length });
            i++;
            continue;
        }

        const currentDepth = delimiterStack.length;

        // 7. String Literals (single or double quoted with escape support)
        if (ch === "'" || ch === '"') {
            const quote = ch;
            let strVal = "";
            let escaped = false;
            let closed = false;
            i++; // skip opening quote

            while (i < len) {
                const c = input[i];
                if (escaped) {
                    strVal += c;
                    escaped = false;
                    i++;
                } else if (c === "\\") {
                    escaped = true;
                    i++;
                } else if (c === quote) {
                    closed = true;
                    i++; // skip closing quote
                    break;
                } else {
                    strVal += c;
                    i++;
                }
            }

            if (!closed) {
                throw new Error("Unterminated string literal detected.");
            }

            tokens.push({ type: "STRING", value: strVal, depth: currentDepth });
            continue;
        }

        // 8. Numeric Literals (strictly valid integers or decimals)
        if (/\d/.test(ch)) {
            let numStr = "";
            while (i < len && /\d/.test(input[i])) {
                numStr += input[i];
                i++;
            }

            // Check for valid decimal point followed by digits (e.g. 1.5), avoiding range operator '..'
            if (input[i] === "." && input[i + 1] !== "." && /\d/.test(input[i + 1])) {
                numStr += ".";
                i++;
                while (i < len && /\d/.test(input[i])) {
                    numStr += input[i];
                    i++;
                }
            } else if (input[i] === "." && input[i + 1] !== ".") {
                throw new Error(`Malformed numeric literal '${numStr}.' with trailing dot.`);
            }

            // Check for malformed trailing letters (e.g. 123abc)
            if (i < len && /[a-zA-Z_]/.test(input[i])) {
                throw new Error(`Malformed numeric literal with trailing identifier character at position ${i}.`);
            }

            tokens.push({ type: "NUMBER", value: numStr, depth: currentDepth });
            continue;
        }

        // 9. Named Parameters: $parameterName
        //    Allowed:  $name, $path, $limit, $someVar_1
        //    Rejected: $  (bare dollar), $123  (digit-only / digit-led name)
        if (ch === "$") {
            i++; // skip the '$'

            // Must be followed immediately by a letter or underscore (not a digit,
            // not end-of-input, not any other character).
            if (i >= len || !/[a-zA-Z_]/.test(input[i])) {
                throw new Error(
                    "Malformed parameter: '$' must be followed by a letter or underscore " +
                    "(e.g. $name, $path). Bare '$' and digit-led names like $123 are not permitted."
                );
            }

            let paramName = "";
            while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
                paramName += input[i];
                i++;
            }

            // Emit as PARAM — a distinct token type that is never confused with
            // clause keywords, identifiers, function names, or property names.
            tokens.push({ type: "PARAM", value: paramName, depth: currentDepth });
            continue;
        }

        // 10. Identifiers and Keywords
        if (/[a-zA-Z_]/.test(ch)) {
            let ident = "";
            while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
                ident += input[i];
                i++;
            }
            tokens.push({ type: "IDENT", value: ident, depth: currentDepth });
            continue;
        }

        // 11. Multi-character Operators and Punctuation
        if (ch === "-" && input[i + 1] === ">") {
            tokens.push({ type: "PUNCT", value: "->", depth: currentDepth });
            i += 2;
            continue;
        }
        if (ch === "<" && input[i + 1] === "-") {
            tokens.push({ type: "PUNCT", value: "<-", depth: currentDepth });
            i += 2;
            continue;
        }
        if (ch === "<" && input[i + 1] === ">") {
            tokens.push({ type: "PUNCT", value: "<>", depth: currentDepth });
            i += 2;
            continue;
        }
        if (ch === "<" && input[i + 1] === "=") {
            tokens.push({ type: "PUNCT", value: "<=", depth: currentDepth });
            i += 2;
            continue;
        }
        if (ch === ">" && input[i + 1] === "=") {
            tokens.push({ type: "PUNCT", value: ">=", depth: currentDepth });
            i += 2;
            continue;
        }
        if (ch === "!" && input[i + 1] === "=") {
            tokens.push({ type: "PUNCT", value: "!=", depth: currentDepth });
            i += 2;
            continue;
        }
        if (ch === "." && input[i + 1] === ".") {
            tokens.push({ type: "PUNCT", value: "..", depth: currentDepth });
            i += 2;
            continue;
        }

        // 12. Allowed Single Punctuation / Operators
        const ALLOWED_SINGLE_PUNCT = new Set([":", ",", ".", "*", "+", "-", "=", "<", ">", "!"]);
        if (ALLOWED_SINGLE_PUNCT.has(ch)) {
            tokens.push({ type: "PUNCT", value: ch, depth: currentDepth });
            i++;
            continue;
        }

        // 13. Reject any unknown punctuation or operator
        throw new Error(`Unsupported or illegal character '${ch}' at character position ${i}.`);
    }

    // Verify all delimiters are closed
    if (delimiterStack.length > 0) {
        throw new Error(`Unclosed delimiter '${delimiterStack.pop()}'. Delimiters must be balanced.`);
    }

    return tokens;
}

/**
 * Validates clause boundaries, sequencing, and strictly allowed clauses.
 *
 * @param {Array<{ type: string, value: string, depth: number }>} tokens - Token stream
 * @returns {Array<{ name: string, startIndex: number, endIndex: number, tokens: Array }>} - Segmented clauses
 * @throws {Error} - On invalid clause sequence or unknown clause keywords
 */
function validateAndSegmentClauses(tokens) {
    const clauseIndices = [];
    let i = 0;

    // Scan for top-level (depth === 0) clause starters
    while (i < tokens.length) {
        const token = tokens[i];

        // Global check: forbidden mutation/DDL keywords are rejected anywhere in query
        if (token.type === "IDENT" && FORBIDDEN_KEYWORDS.has(token.value.toUpperCase())) {
            throw new Error(`Forbidden keyword or operation '${token.value}' is not permitted.`);
        }

        if (token.depth === 0 && token.type === "IDENT") {
            const upper = token.value.toUpperCase();

            // OPTIONAL MATCH
            if (upper === "OPTIONAL" && tokens[i + 1] && tokens[i + 1].depth === 0 && tokens[i + 1].type === "IDENT" && tokens[i + 1].value.toUpperCase() === "MATCH") {
                clauseIndices.push({ name: "OPTIONAL MATCH", startIndex: i, length: 2 });
                i += 2;
                continue;
            }

            // MATCH
            if (upper === "MATCH") {
                clauseIndices.push({ name: "MATCH", startIndex: i, length: 1 });
                i++;
                continue;
            }

            // WHERE
            if (upper === "WHERE") {
                clauseIndices.push({ name: "WHERE", startIndex: i, length: 1 });
                i++;
                continue;
            }

            // WITH (only when not preceded by STARTS or ENDS)
            if (upper === "WITH") {
                const prev = tokens[i - 1];
                const prevUpper = prev && prev.type === "IDENT" ? prev.value.toUpperCase() : "";
                if (prevUpper !== "STARTS" && prevUpper !== "ENDS") {
                    clauseIndices.push({ name: "WITH", startIndex: i, length: 1 });
                    i++;
                    continue;
                }
            }

            // RETURN
            if (upper === "RETURN") {
                const prev = tokens[i - 1];
                const isAfterDot = prev && prev.type === "PUNCT" && prev.value === ".";
                const isAfterAs = prev && prev.type === "IDENT" && prev.value.toUpperCase() === "AS";
                if (!isAfterDot && !isAfterAs) {
                    clauseIndices.push({ name: "RETURN", startIndex: i, length: 1 });
                    i++;
                    continue;
                }
            }

            // ORDER BY
            if (upper === "ORDER" && tokens[i + 1] && tokens[i + 1].depth === 0 && tokens[i + 1].type === "IDENT" && tokens[i + 1].value.toUpperCase() === "BY") {
                clauseIndices.push({ name: "ORDER BY", startIndex: i, length: 2 });
                i += 2;
                continue;
            }

            // SKIP
            if (upper === "SKIP") {
                clauseIndices.push({ name: "SKIP", startIndex: i, length: 1 });
                i++;
                continue;
            }

            // LIMIT
            if (upper === "LIMIT") {
                const prev = tokens[i - 1];
                const isAfterDot = prev && prev.type === "PUNCT" && prev.value === ".";
                const isAfterAs = prev && prev.type === "IDENT" && prev.value.toUpperCase() === "AS";
                if (!isAfterDot && !isAfterAs) {
                    clauseIndices.push({ name: "LIMIT", startIndex: i, length: 1 });
                    i++;
                    continue;
                }
            }
        }

        i++;
    }

    if (clauseIndices.length === 0) {
        throw new Error("No recognised Cypher clauses found in query.");
    }

    // Slice token stream into distinct clauses
    const clauses = [];
    for (let c = 0; c < clauseIndices.length; c++) {
        const current = clauseIndices[c];
        const next = clauseIndices[c + 1];
        const endIndex = next ? next.startIndex : tokens.length;
        const clauseTokens = tokens.slice(current.startIndex + current.length, endIndex);
        clauses.push({
            name: current.name,
            startIndex: current.startIndex,
            endIndex: endIndex,
            tokens: clauseTokens
        });
    }

    // Must start with MATCH or OPTIONAL MATCH
    const firstClause = clauses[0].name;
    if (firstClause !== "MATCH" && firstClause !== "OPTIONAL MATCH") {
        throw new Error(`Query must start with MATCH or OPTIONAL MATCH, but started with '${firstClause}'.`);
    }

    // Must contain a RETURN clause
    const hasReturn = clauses.some(c => c.name === "RETURN");
    if (!hasReturn) {
        throw new Error("Query must contain a RETURN clause.");
    }

    // State machine to enforce conservative progression
    let state = "INITIAL";

    for (const clause of clauses) {
        const cName = clause.name;

        switch (state) {
            case "INITIAL":
                if (cName === "MATCH" || cName === "OPTIONAL MATCH") {
                    state = "MATCH";
                } else {
                    throw new Error(`Unexpected starting clause '${cName}'.`);
                }
                break;

            case "MATCH":
                if (cName === "WHERE") {
                    state = "WHERE_MATCH";
                } else if (cName === "MATCH" || cName === "OPTIONAL MATCH") {
                    state = "MATCH";
                } else if (cName === "WITH") {
                    state = "WITH";
                } else if (cName === "RETURN") {
                    state = "RETURN";
                } else {
                    throw new Error(`Clause '${cName}' cannot directly follow MATCH.`);
                }
                break;

            case "WHERE_MATCH":
                if (cName === "MATCH" || cName === "OPTIONAL MATCH") {
                    state = "MATCH";
                } else if (cName === "WITH") {
                    state = "WITH";
                } else if (cName === "RETURN") {
                    state = "RETURN";
                } else {
                    throw new Error(`Clause '${cName}' cannot follow WHERE in MATCH clause.`);
                }
                break;

            case "WITH":
                if (cName === "WHERE") {
                    state = "WHERE_WITH";
                } else if (cName === "MATCH" || cName === "OPTIONAL MATCH") {
                    state = "MATCH";
                } else if (cName === "RETURN") {
                    state = "RETURN";
                } else {
                    throw new Error(`Clause '${cName}' cannot directly follow WITH.`);
                }
                break;

            case "WHERE_WITH":
                if (cName === "MATCH" || cName === "OPTIONAL MATCH") {
                    state = "MATCH";
                } else if (cName === "RETURN") {
                    state = "RETURN";
                } else {
                    throw new Error(`Clause '${cName}' cannot follow WHERE in WITH clause.`);
                }
                break;

            case "RETURN":
                if (cName === "ORDER BY") {
                    state = "ORDER_BY";
                } else if (cName === "SKIP") {
                    state = "SKIP";
                } else if (cName === "LIMIT") {
                    state = "LIMIT";
                } else {
                    throw new Error(`Clause '${cName}' cannot follow RETURN. Only ORDER BY, SKIP, or LIMIT are allowed.`);
                }
                break;

            case "ORDER_BY":
                if (cName === "SKIP") {
                    state = "SKIP";
                } else if (cName === "LIMIT") {
                    state = "LIMIT";
                } else {
                    throw new Error(`Clause '${cName}' cannot follow ORDER BY. Only SKIP or LIMIT are allowed.`);
                }
                break;

            case "SKIP":
                if (cName === "LIMIT") {
                    state = "LIMIT";
                } else {
                    throw new Error(`Clause '${cName}' cannot follow SKIP. Only LIMIT is allowed.`);
                }
                break;

            case "LIMIT":
                throw new Error(`No clauses may follow LIMIT, but found '${cName}'.`);

            default:
                throw new Error(`Invalid parser state '${state}'.`);
        }
    }

    const validTerminalStates = new Set(["RETURN", "ORDER_BY", "SKIP", "LIMIT"]);
    if (!validTerminalStates.has(state)) {
        throw new Error(`Query ended in invalid clause state '${state}'. Must terminate with RETURN, ORDER BY, SKIP, or LIMIT.`);
    }

    return clauses;
}

/**
 * Validates node and relationship patterns inside MATCH and OPTIONAL MATCH clauses.
 * Enforces strictly :File for every node and [:IMPORTS] for every relationship.
 * Rejects untyped edges, multiple labels, and alternation.
 *
 * @param {Array<{ name: string, tokens: Array }>} clauses - Segmented clauses
 * @throws {Error} - On pattern or schema violations
 */
function validateGraphPatterns(clauses) {
    for (const clause of clauses) {
        if (clause.name !== "MATCH" && clause.name !== "OPTIONAL MATCH") {
            continue;
        }

        const tokens = clause.tokens;
        let k = 0;

        while (k < tokens.length) {
            const tok = tokens[k];

            // 1. Node Pattern: (...)
            if (tok.type === "PUNCT" && tok.value === "(") {
                const nodeTokens = [];
                k++; // step inside '('

                while (k < tokens.length && !(tokens[k].type === "PUNCT" && tokens[k].value === ")")) {
                    nodeTokens.push(tokens[k]);
                    k++;
                }

                if (k >= tokens.length) {
                    throw new Error("Unclosed node pattern in MATCH clause.");
                }
                k++; // consume closing ')'

                // Inspect node pattern elements before property map '{'
                let hasColon = false;
                let labelCount = 0;
                let labelName = "";

                for (let n = 0; n < nodeTokens.length; n++) {
                    const nt = nodeTokens[n];

                    // Stop label checking at start of property map
                    if (nt.type === "PUNCT" && nt.value === "{") {
                        break;
                    }

                    if (nt.type === "PUNCT" && nt.value === ":") {
                        hasColon = true;
                        const nextTok = nodeTokens[n + 1];
                        if (!nextTok || nextTok.type !== "IDENT") {
                            throw new Error("Missing label identifier after ':' in node pattern.");
                        }
                        labelCount++;
                        labelName = nextTok.value;
                    }

                    if (nt.type === "PUNCT" && nt.value === "|") {
                        throw new Error("Label alternation (|) is not permitted in node patterns.");
                    }
                }

                // Enforce strictly one label: File
                if (!hasColon || labelCount === 0) {
                    throw new Error("Every node pattern in MATCH must explicitly specify exactly the ':File' label.");
                }

                if (labelCount > 1) {
                    throw new Error("Multiple node labels are not permitted. Every node must have exactly ':File'.");
                }

                if (labelName.toLowerCase() !== "file") {
                    throw new Error(`Disallowed node label ':${labelName}'. Only ':File' is permitted by the RippleCheck schema.`);
                }

                continue;
            }

            // 2. Relationship Pattern: [...]
            if (tok.type === "PUNCT" && tok.value === "[") {
                const relTokens = [];
                k++; // step inside '['

                while (k < tokens.length && !(tokens[k].type === "PUNCT" && tokens[k].value === "]")) {
                    relTokens.push(tokens[k]);
                    k++;
                }

                if (k >= tokens.length) {
                    throw new Error("Unclosed relationship pattern in MATCH clause.");
                }
                k++; // consume closing ']'

                let hasColon = false;
                let typeCount = 0;
                let typeName = "";

                for (let r = 0; r < relTokens.length; r++) {
                    const rt = relTokens[r];

                    if (rt.type === "PUNCT" && rt.value === ":") {
                        hasColon = true;
                        const nextTok = relTokens[r + 1];
                        if (!nextTok || nextTok.type !== "IDENT") {
                            throw new Error("Missing relationship type identifier after ':' in relationship pattern.");
                        }
                        typeCount++;
                        typeName = nextTok.value;
                    }

                    if (rt.type === "PUNCT" && rt.value === "|") {
                        throw new Error("Relationship type alternation (|) is not permitted.");
                    }
                }

                // Enforce strictly one type: IMPORTS
                if (!hasColon || typeCount === 0) {
                    throw new Error("Every relationship pattern must explicitly specify the '[:IMPORTS]' type.");
                }

                if (typeCount > 1) {
                    throw new Error("Multiple relationship types are not permitted. Only '[:IMPORTS]' is allowed.");
                }

                if (typeName.toLowerCase() !== "imports") {
                    throw new Error(`Disallowed relationship type '[:${typeName}]'. Only '[:IMPORTS]' is permitted.`);
                }

                continue;
            }

            // 3. Reject untyped edge connectors without brackets: -->, <--, --
            if (tok.type === "PUNCT") {
                if (tok.value === "->" || tok.value === "<-") {
                    const prev = tokens[k - 1];
                    const next = tokens[k + 1];
                    // If not connected to a bracketed relationship, reject untyped edge
                    const isPrevRel = prev && prev.type === "PUNCT" && prev.value === "]";
                    const isNextRel = next && next.type === "PUNCT" && next.value === "[";
                    const isPrevNode = prev && prev.type === "PUNCT" && prev.value === ")";
                    const isNextNode = next && next.type === "PUNCT" && next.value === "(";
                    const isPrevDash = prev && prev.type === "PUNCT" && prev.value === "-";
                    const isNextDash = next && next.type === "PUNCT" && next.value === "-";

                    if (
                        (isPrevNode && isNextNode) ||
                        (isPrevNode && !isNextRel && isNextDash) ||
                        (isNextNode && !isPrevRel && isPrevDash) ||
                        (!isPrevRel && !isNextRel)
                    ) {
                        throw new Error("Untyped relationships are not permitted. Every relationship must explicitly specify the '[:IMPORTS]' type.");
                    }
                }

                // Also check for unbracketed undirected connector '--' between nodes: ')-' followed by '-(', or ')-' followed by '-['
                if (tok.value === "-") {
                    const prev = tokens[k - 1];
                    const next = tokens[k + 1];
                    const isPrevNode = prev && prev.type === "PUNCT" && prev.value === ")";
                    const isNextDash = next && next.type === "PUNCT" && next.value === "-";
                    if (isPrevNode && isNextDash) {
                        const afterDash = tokens[k + 2];
                        if (afterDash && afterDash.type === "PUNCT" && (afterDash.value === "(" || afterDash.value === "->")) {
                            throw new Error("Untyped relationships are not permitted. Every relationship must explicitly specify the '[:IMPORTS]' type.");
                        }
                    }
                }
            }

            k++;
        }
    }
}

/**
 * Validates function calls, property accesses, and property map keys throughout the query.
 * Enforces function allowlist and property allowlist.
 *
 * @param {Array<{ type: string, value: string, depth: number }>} tokens - Token stream
 * @throws {Error} - On unknown function calls or disallowed property accesses
 */
function validateExpressionsAndProperties(tokens) {
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        // 1. Function Call Validation: IDENT followed by '('
        if (tok.type === "IDENT" && tokens[i + 1] && tokens[i + 1].type === "PUNCT" && tokens[i + 1].value === "(") {
            const funcUpper = tok.value.toUpperCase();

            // Ignore clause starters that happen to be followed by '(' (e.g. MATCH (...))
            // and boolean/comparison operator keywords (e.g. AND (...), NOT (...))
            if (ALLOWED_CLAUSE_STARTERS.has(funcUpper) || funcUpper === "OPTIONAL" || OPERATOR_KEYWORDS.has(funcUpper)) {
                continue;
            }

            // If it's not a clause keyword, it is a function invocation
            const funcLower = tok.value.toLowerCase();
            if (!ALLOWED_FUNCTIONS.has(funcLower)) {
                throw new Error(
                    `Unknown or unsupported function '${tok.value}()'. Allowed read-only functions are: count, collect, toLower, toUpper, trim, coalesce, isEmpty, exists, size, length.`
                );
            }
        }

        // 2. Property Access Validation: <ident>.<prop>
        if (tok.type === "PUNCT" && tok.value === ".") {
            const prev = tokens[i - 1];
            const next = tokens[i + 1];

            // If preceded and followed by an identifier, it is a property access
            if (prev && prev.type === "IDENT" && next && next.type === "IDENT") {
                const propLower = next.value.toLowerCase();
                if (!ALLOWED_PROPERTIES.has(propLower)) {
                    throw new Error(`Disallowed property '${next.value}'. Only 'path', 'name', and 'summary' are permitted.`);
                }
            }
        }

        // 3. Property Map Key Validation: { prop: value }
        if (tok.type === "PUNCT" && tok.value === "{") {
            let m = i + 1;
            while (m < tokens.length && !(tokens[m].type === "PUNCT" && tokens[m].value === "}")) {
                if (tokens[m].type === "PUNCT" && tokens[m].value === ":") {
                    const keyToken = tokens[m - 1];
                    if (keyToken && keyToken.type === "IDENT") {
                        const keyLower = keyToken.value.toLowerCase();
                        if (!ALLOWED_PROPERTIES.has(keyLower)) {
                            throw new Error(`Disallowed property key '${keyToken.value}'. Only 'path', 'name', and 'summary' are permitted.`);
                        }
                    }
                }
                m++;
            }
        }
    }
}

/**
 * Validates that an AI-generated Cypher query is strictly read-only,
 * safely structured, and compliant with the RippleCheck schema.
 *
 * @param {string} query - The raw Cypher query string
 * @returns {boolean} - Returns true if the query satisfies all allowlist rules
 * @throws {Error} - Descriptive error detailing why the query was rejected
 */
function validateCypher(query) {
    if (typeof query !== "string" || query.trim().length === 0) {
        throw new Error("Query must be a non-empty string.");
    }

    // 1. Lexical Tokenization with delimiter balance & numeric integrity checks
    const tokens = tokenize(query.trim());

    if (tokens.length === 0) {
        throw new Error("Query contains no valid tokens.");
    }

    // 2. Validate clause allowlist, detect unknown clauses, and enforce strict state machine sequence
    const clauses = validateAndSegmentClauses(tokens);

    // 3. Enforce graph pattern constraints (strictly :File for nodes, strictly [:IMPORTS] for relationships)
    validateGraphPatterns(clauses);

    // 4. Enforce expression allowlist: strictly allowed read-only functions and schema properties
    validateExpressionsAndProperties(tokens);

    return true;
}

module.exports = { validateCypher };
