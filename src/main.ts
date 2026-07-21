import * as lexer from "./lexer.ts"

console.log(new lexer.Lexer("1 \\red`as{d\\n}asd` ++ 1").lexing())
