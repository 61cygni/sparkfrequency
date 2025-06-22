import { dyno } from "@sparkjsdev/spark";
import * as THREE from "three";

// Debug flag - set to true to enable debug logging
const DEBUG = false;

// Debug logging helper
function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

const {
  add,
  sub,
  mod,
  mul,
  div,
  max,
  min,
  mix,
  sin,
  cos,
  pow,
  fract,
  split,
  dynoConst,
  dynoFloat,
  dynoVec3,
  dynoLiteral,
  sqrt,
  step,
} = dyno;

// Type definitions for dyno values
export type DynoValue = unknown; // Change to unknown to fix type errors while preserving functionality

// Operator precedence levels
const PRECEDENCE = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  mix: 3,
  max: 3,
  min: 3,
  property: 4, // Property access has higher precedence than operators
  call: 5, // Function calls have highest precedence
};

// Operator function map with proper typing
const operators = {
  "+": (a: DynoValue, b: DynoValue) => add(a, b),
  "-": (a: DynoValue, b: DynoValue) => sub(a, b),
  "*": (a: DynoValue, b: DynoValue) => mul(a, b),
  "/": (a: DynoValue, b: DynoValue) => div(a, b),
  "%": (a: DynoValue, b: DynoValue) => mod(a, b),
};

// Function map with proper typing
const functions = {
  mix: (a: DynoValue, b: DynoValue, t: DynoValue) => {
    return mix(a, b, t);
  },
  max: (a: DynoValue, b: DynoValue) => {
    return max(a, b);
  },
  min: (a: DynoValue, b: DynoValue) => {
    return min(a, b);
  },
  sin: (arg: DynoValue) => {
    return sin(arg);
  },
  cos: (arg: DynoValue) => {
    return cos(arg);
  },
  fract: (arg: DynoValue) => {
    return fract(arg);
  },
  sqrt: (arg: DynoValue) => {
    return sqrt(arg);
  },
  step: (a: DynoValue, b: DynoValue) => {
    return step(a, b);
  },
  pow: (a: DynoValue, b: DynoValue) => {
    return pow(a, b);
  },
  PI: () => dynoLiteral("float", "PI"),
};

// Helper to check if a value is a valid dyno type
function isValidDynoType(value: unknown): value is DynoValue {
  if (!value || typeof value !== "object") {
    // Handles null, undefined, and non-objects
    return false;
  }

  // Check for the original structure (leaf nodes / constants like from dynoConst, dynoFloat)
  if ("type" in value && "value" in value && typeof value.type === "string") {
    return true;
  }

  // Check if it's a combine operation by looking for its specific properties
  if ("outTypes" in value) {
    return true;
  }

  return false;
}

// Token types
type TokenType =
  | "number"
  | "operator"
  | "function"
  | "paren"
  | "value"
  | "property"
  | "constant";

interface Token {
  type: TokenType;
  value: string;
  precedence?: number;
}

class Tokenizer {
  private tokens: Token[] = [];
  private current = 0;

  constructor(expr: string, values: DynoValue[]) {
    // First, replace all ${n} with a special token
    const processedExpr = expr
      .replace(/\${(\d+)}/g, (_, index) => `__VAL${index}__`)
      .replace(/[()]/g, " $& ") // Add spaces around parentheses
      .replace(/,/g, " , "); // Add spaces around commas

    // Split on spaces and parentheses, but keep parentheses as separate tokens
    const rawTokens = processedExpr.split(/\s+/).filter((t) => t);

    // Convert raw tokens to typed tokens
    for (let i = 0; i < rawTokens.length; i++) {
      const token = rawTokens[i];

      if (
        token.startsWith("__VAL") &&
        token.includes(".") &&
        token.match(/^__VAL\d+__\.[a-zA-Z_][a-zA-Z0-9_]*$/)
      ) {
        // Handle __VALn__.property
        const parts = token.split(".", 2); // Split into exactly two parts
        const valToken = parts[0]; // __VALn__
        const propToken = parts[1]; // property
        this.tokens.push({ type: "value", value: valToken, precedence: 0 });
        this.tokens.push({
          type: "property",
          value: propToken,
          precedence: PRECEDENCE.property,
        });
      } else if (token.startsWith("__VAL")) {
        // Handle plain __VALn__ (e.g. __VAL0__)
        this.tokens.push({ type: "value", value: token, precedence: 0 });
      } else if (token === "(" || token === ")") {
        this.tokens.push({ type: "paren", value: token });
      } else if (token === ",") {
        this.tokens.push({ type: "operator", value: token, precedence: 0 }); // Handle comma as operator with lowest precedence
      } else if (token in operators) {
        this.tokens.push({
          type: "operator",
          value: token,
          precedence: PRECEDENCE[token as keyof typeof PRECEDENCE],
        });
      } else if (token in functions) {
        if (token === "PI") {
          this.tokens.push({ type: "constant", value: token });
        } else {
          // console.log("functino token", token);
          this.tokens.push({
            type: "function",
            value: token,
            precedence: PRECEDENCE.call,
          });
        }
      } else if (token.includes(".")) {
        // First check if it's a decimal number
        const num = Number.parseFloat(token);
        if (!Number.isNaN(num)) {
          this.tokens.push({ type: "number", value: token });
        } else if (token.startsWith("__VAL")) {
          // Handle property access for __VALn__.property
          const [obj, prop] = token.split(".", 2);
          this.tokens.push({ type: "value", value: obj });
          this.tokens.push({
            type: "property",
            value: prop,
            precedence: PRECEDENCE.property,
          });
        } else {
          throw new Error(`Invalid token: ${token}`);
        }
      } else {
        const num = Number.parseFloat(token);
        if (!Number.isNaN(num)) {
          this.tokens.push({ type: "number", value: token });
        } else {
          throw new Error(`Invalid token: ${token}`);
        }
      }
    }
  }

  peek(): Token | null {
    return this.current < this.tokens.length ? this.tokens[this.current] : null;
  }

  advance(): Token {
    if (this.current >= this.tokens.length) {
      throw new Error("Unexpected end of expression");
    }
    return this.tokens[this.current++];
  }

  match(type: TokenType): boolean {
    const token = this.peek();
    return token !== null && token.type === type;
  }
}

class PrattParser {
  private tokenizer: Tokenizer;
  private values: DynoValue[];

  constructor(expr: string, values: DynoValue[]) {
    this.tokenizer = new Tokenizer(expr, values);
    this.values = values;
  }

  parseExpression(precedence = 0): DynoValue {
    debugLog("parseExpression called with precedence:", precedence);

    // Handle empty expressions
    if (!this.tokenizer.peek()) {
      debugLog("Empty expression, returning default value");
      return dynoConst("float", 0);
    }

    let left = this.parsePrefix();
    debugLog("After parsePrefix, left:", left);
    // console.log(
    //   "After parsePrefix, this.tokenizer.peek()",
    //   this.tokenizer.peek(),
    // );

    while (true) {
      const token = this.tokenizer.peek();
      debugLog("Peeking next token:", token);

      // Check for property access first
      if (token && token.type === "property") {
        this.tokenizer.advance();
        debugLog("Processing property:", token.value);
        left = this.parsePropertyAccess(left, token);
        debugLog("After parsePropertyAccess, left:", left);
        continue;
      }

      if (
        !token ||
        token.precedence === undefined ||
        token.precedence <= precedence
      ) {
        debugLog("Breaking loop - token:", token, "precedence:", precedence);
        break;
      }

      if (token.type === "operator") {
        this.tokenizer.advance(); // consume the operator
        debugLog("Processing operator:", token.value);
        left = this.parseInfix(left, token);
        debugLog("After parseInfix, left:", left);
      } else {
        debugLog("Breaking loop - unexpected token type:", token.type);
        break;
      }
    }

    return left;
  }

  parsePrefix(): DynoValue {
    const token = this.tokenizer.advance();
    debugLog("parsePrefix processing token:", token);

    if (token.type === "number") {
      const result = dynoConst("float", Number.parseFloat(token.value));
      debugLog("Parsed number:", result);
      return result;
    }

    if (token.type === "value") {
      const index = Number.parseInt(token.value.slice(5, -2));
      const value = this.values[index];
      if (!isValidDynoType(value)) {
        console.log("value", value);
        throw new Error(`Invalid interpolated value at index ${index}`);
      }
      debugLog("Parsed value:", value);
      return value;
    }

    if (token.type === "function") {
      debugLog("Parsing function call:", token.value);
      return this.parseFunctionCall(token);
    }

    if (token.type === "constant") {
      // PI is a constant, directly use its function which returns a DynoLiteral
      const result = functions.PI();
      debugLog("Parsed constant (PI):", result);
      return result; // functions.PI() already returns a complete DynoValue (DynoLiteral)
    }

    if (token.type === "paren" && token.value === "(") {
      debugLog("Parsing parenthesized expression");
      const expr = this.parseExpression();
      if (
        !this.tokenizer.match("paren") ||
        this.tokenizer.advance().value !== ")"
      ) {
        throw new Error("Expected closing parenthesis");
      }
      debugLog("Parsed parenthesized expression:", expr);
      return expr;
    }

    throw new Error(`Unexpected token: ${token.value}`);
  }

  parseInfix(left: DynoValue, operator: Token): DynoValue {
    debugLog("parseInfix - left:", left, "operator:", operator);
    const right = this.parseExpression(operator.precedence);
    debugLog("parseInfix - right:", right);

    // Return the direct result from the operator without wrapping
    debugLog("parseInfix - operator:", operator.value);
    debugLog("parseInfix - left:", left);
    debugLog("parseInfix - right:", right);
    const result = operators[operator.value as keyof typeof operators](
      left,
      right,
    );
    debugLog("parseInfix - result:", result);
    return result as DynoValue;
  }

  parseFunctionCall(func: Token): DynoValue {
    //console.log("parseFunctionCall - function:", func.value);
    if (
      !this.tokenizer.match("paren") ||
      this.tokenizer.advance().value !== "("
    ) {
      throw new Error(
        `Expected opening parenthesis after function ${func.value}`,
      );
    }

    const args: DynoValue[] = [];

    // Use 0 precedence to parse the full expression as argument
    //console.log("this.tokenizer.peek()", this.tokenizer.peek());
    const arg = this.parseExpression(0);
    args.push(arg);
    debugLog("parseFunctionCall - argument:", arg);
    //console.log("this.tokenizer.peek()", this.tokenizer.peek());
    // FIXME: this is a hack to support arity up to three
    if (this.tokenizer.peek()?.value === ",") {
      this.tokenizer.advance(); // consume comma
      const secondArg = this.parseExpression(0);
      args.push(secondArg);
      if (this.tokenizer.peek()?.value === ",") {
        this.tokenizer.advance(); // consume comma
        const thirdArg = this.parseExpression(0);
        args.push(thirdArg);
      }
    }

    if (
      !this.tokenizer.match("paren") ||
      this.tokenizer.advance().value !== ")"
    ) {
      const nextToken = this.tokenizer.peek();
      console.log(
        "Expected closing parenthesis after function. Instead found: ",
        nextToken,
      );
      throw new Error(
        `Expected closing parenthesis after function ${func.value}`,
      );
    }

    // Return the direct result from the function without wrapping
    debugLog("parseFunctionCall - function:", func.value);
    debugLog("parseFunctionCall - arguments:", args);
    const result = functions[func.value as keyof typeof functions](...args);
    debugLog("parseFunctionCall - result:", result);
    return result as DynoValue;
  }

  parsePropertyAccess(left: DynoValue, property: Token): DynoValue {
    debugLog("parsePropertyAccess - left:", left, "property:", property);
    if (!isValidDynoType(left)) {
      throw new Error(`Invalid value for property access: ${left}`);
    }
    const result = split(left).outputs[property.value];
    debugLog("parsePropertyAccess - result:", result);
    return result;
  }
}

// Main tag function
export function dynoTag(
  strings: TemplateStringsArray,
  ...values: DynoValue[]
): DynoValue {
  // convert all javascript numbers to dynoFloat
  const processedValues = values.map((value) => {
    debugLog("value", value);
    if (typeof value === "number") {
      return dynoConst("float", value);
    }
    return value;
  });

  // Validate interpolated values
  for (const value of processedValues) {
    if (!isValidDynoType(value)) {
      debugLog("value", value);
      throw new Error(`Invalid dyno type: ${value}`);
    }
  }

  // Combine all parts into a single expression
  let fullExpr = "";
  for (let i = 0; i < strings.length; i++) {
    fullExpr += strings[i];
    if (i < values.length) {
      fullExpr += `$${i}`; // Use $0, $1, etc. as placeholders
    }
  }

  // Replace the placeholders with ${index} for parsing
  const expr = fullExpr.replace(/\$(\d+)/g, "${$1}");

  // Parse the complete expression using Pratt parser
  const parser = new PrattParser(expr, processedValues);
  return parser.parseExpression();
}

// Shorthand export
export const d = dynoTag;

// Test suite
export function runTests() {
  debugLog("Running dynoexp tests...");
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ FAIL: ${name}`);
      console.log(error);
      failed++;
    }
  }

  // Test data
  const testVec3 = dynoVec3(new THREE.Vector3(1, 2, 3));
  const five = 5.0;
  const testFloat = dynoFloat(five);
  const testConst = dynoConst("float", 10);

  debugLog("testFloat", testFloat);
  debugLog("testConst", testConst);

  // Basic arithmetic tests
  test("Basic addition", () => {
    const result = d`${testFloat} + ${testConst}`;
    debugLog("Addition result:", result);
  });

  test("Basic multiplication", () => {
    const result = d`${testFloat} * 2`;
    debugLog("Multiplication result:", result);
  });

  test("Basic float literal", () => {
    const result = d`${testFloat} / .2`;
    debugLog("Basic float literal result:", result);
  });

  test("Complex arithmetic", () => {
    const result = d`(${testFloat} + ${testConst}) * 2`;
    debugLog("Complex arithmetic result:", result);
  });

  // Vector property access tests
  test("Vector x property", () => {
    const result = d`${testVec3}.x`;
  });

  test("Vector y property", () => {
    const result = d`${testVec3}.y`;
  });

  test("Vector z property", () => {
    const result = d`${testVec3}.z`;
  });

  // Function tests
  test("Sin function", () => {
    const result = d`sin(${testFloat})`;
  });

  test("Cos function", () => {
    const result = d`cos(${testFloat})`;
  });

  test("Fract function", () => {
    const result = d`fract(${testFloat})`;
  });

  // PI constant test
  test("PI constant", () => {
    const result = d`PI`;
  });

  // Complex expression tests
  test("Complex vector expression", () => {
    const result = d`sin(${testVec3}.x * PI) + cos(${testVec3}.y)`;
  });

  test("Nested function calls", () => {
    const result = d`sin(cos(${testFloat}))`;
  });

  // Error cases
  test("Invalid function name", () => {
    try {
      d`invalidFunc(${testFloat})`;
      throw new Error("Should have thrown for invalid function");
    } catch (error) {
      // Expected error
    }
  });

  test("Invalid property access", () => {
    try {
      d`${testFloat}.invalid`;
      throw new Error("Should have thrown for invalid property");
    } catch (error) {
      // Expected error
    }
  });

  test("Invalid operator", () => {
    try {
      d`${testFloat} ^ ${testConst}`;
      throw new Error("Should have thrown for invalid operator");
    } catch (error) {
      // Expected error
    }
  });

  // Edge cases
  test("Empty expression", () => {
    const result = d``;
  });

  test("Single value", () => {
    const result = d`${testFloat}`;
  });

  test("Multiple spaces", () => {
    const result = d`${testFloat}  +  ${testConst}`;
  });

  test("Modulus operation", () => {
    const result = d`${testFloat} % ${testConst}`;
  });

  test("Complex expression with modulus", () => {
    const result = d`(${testFloat} + ${testConst}) % 2`;
  });

  test("Modulus operation with vector", () => {
    const result = d`${testVec3}.x % ${testConst}`;
  });

  test("Complex arithmetic with vectors", () => {
    // box.miny + (position.y * (box.max.y - box.min.y))
    const result = d`${testVec3}.x + (${testVec3}.y * (${testVec3}.z - ${testVec3}.x))`;
    debugLog("result", result);
  });

  test("Normal variable", () => {
    const testFloat = 3.0;
    const result = d`${testFloat} + 1`;
  });

  test("Max function", () => {
    const result = d`max(${testFloat}, 2)`;
  });

  test("Sqrt function", () => {
    const result = d`sqrt(${testFloat})`;
  });

  test("Mix function", () => {
    const testVec3a = dynoVec3(new THREE.Vector3(1, 2, 3));
    const testVec3b = dynoVec3(new THREE.Vector3(1, 2, 3));
    const testVec3c = dynoVec3(new THREE.Vector3(1, 2, 3));
    const result = d`mix(${testVec3a}, ${testVec3b}, ${testVec3c})`;
  });

  test("Complex expression", () => {
    const result = d`${testFloat}+${testConst}/${testVec3}.x+PI/2`;
  });

  // Print summary
  console.log("\nTest Summary:");
  console.log(`Total: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(
    `Success rate: ${((passed / (passed + failed)) * 100).toFixed(2)}%`,
  );

  return {
    passed,
    failed,
    total: passed + failed,
  };
}
