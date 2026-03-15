First tool name in the TOOLS array: `read_file`

First case/if statement in the tool handler:
```javascript
if (name === 'read_file') {
    const { filename } = input;
    const file = await getFile(filename);
    if (!file) return { content: [{ type: 'text', text: `File not found: ${filename}` }] };
    const lines = file.content.split('\n').length;
    const size = Buffer.byteLength(file.content, 'utf8');
    return { content: [{ type: 'text', text: `File: ${filename}\nSize: ${size} bytes | ${lines} lines\n\n${file.content}` }] };
  }
```

The read_file tool was added correctly as the first tool in the TOOLS array and has the first handler in the handleTool function.