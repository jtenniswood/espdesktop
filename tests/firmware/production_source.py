"""Extract unchanged C++ production definitions for executable host tests."""
import re

def definition(text: str, name: str) -> tuple[int, str]:
    match = re.search(rf"^inline\s+[^;{{}}]*\b{re.escape(name)}\s*\([^;{{}}]*\)\s*\{{", text, re.M)
    if not match:
        raise ValueError(f"Missing production definition: {name}")
    # Ignore comments and literals while finding the matching closing brace.
    tokens = re.finditer(r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[{}]', text[match.end()-1:])
    depth = 0
    for token in tokens:
        if token.group() == "{":
            depth += 1
        elif token.group() == "}":
            depth -= 1
            if depth == 0:
                end = match.end() - 1 + token.end()
                return text.count("\n", 0, match.start()) + 1, text[match.start():end]
    raise ValueError(f"Unclosed production definition: {name}")
