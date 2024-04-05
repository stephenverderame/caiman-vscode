# Caiman Language Extension

Basic syntax highlighting and linting for the Caiman front end. 

## Usage Instructions

1. Make sure you have an updated version of the Caiman compiler. Running `--help`
should show information about a `--quiet` flag.
2. Install the extension into vscode with the command `code --install-extension <extension-vsix-path>`
3. Run vscode. Open settings and set the `Compiler Path` of the caiman-lsp extension
to the path to the caiman compiler.

## Functionality

This Language Server works for `.cm` files. It has the following language features:
- Diagnostics regenerated on each file change or configuration change

## Structure

```
.
├── client // Language Client
│   └── src
│       └── extension.ts // Language Client entry point
├── language-configuration.json // File defining bracket configuration
├── package.json // The extension manifest.
├── server // Language Server
│    └── src
│       └── server.ts // Language Server entry point
└── syntaxes
    └── caiman.tmLanguage.json // The regexes defining the syntax highlighting

```

## Dev Instructions

- Run `npm install` in this folder. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to start compiling the client and server in [watch mode](https://code.visualstudio.com/docs/editor/tasks#:~:text=The%20first%20entry%20executes,the%20HelloWorld.js%20file.).
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5).
- In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open a document in 'hlc' language mode.
- See [Vscode's LSP Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample) for more info
