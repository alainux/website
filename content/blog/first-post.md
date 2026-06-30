+++
title = "Hello World"
date = "2026-06-30"
extra = { math = true }
taxonomies = { tags = ["welcome", "programming"] }
+++

Welcome to my personal site and blog. This site is styled like a retro terminal, utilizing monospace typography, pixel-perfect ASCII boxes, and customized Vim-style status lines.

This post serves as a kitchen sink demonstration page to showcase how various Markdown elements render.

## Heading Level 2

Here is a standard paragraph with **bold text**, *italic text*, and a [hyperlink to access tags](@/blog/_index.md).

### Heading Level 3

Below is a bulleted list:
* Programming and Software Architecture
* Electronics, soldering, and custom keymaps
* Woodworking, photography, and parenting

Here is a numbered list:
1. Initialize the Zola repository.
2. Develop the custom terminal SASS stylesheet.
3. Deploy onto a static hosting provider.

### Quotes and Mentions

> This is a blockquote element representing an external quote. It is indented with a prefix and styled to contrast slightly from the main layout.

### Code and Formatting

To verify code block highlight formatting:
```javascript
// Quick server script
const http = require('http');

http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello from the terminal\n');
}).listen(8080);
```

You can also use inline `code` blocks to reference variables or commands.

### Mathematical Equations (LaTeX)

For technical posts, the blog features integrated KaTeX equations. Here is an inline equation: $f(x) = \int_{-\infty}^{\infty} e^{-x^2} dx$, and a block formula:

$$T = 2\pi \sqrt{\frac{L}{g}}$$
