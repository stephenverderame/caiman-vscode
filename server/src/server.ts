/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { exec, execSync, spawn } from 'child_process';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			// Tell the client that this server supports code completion.
			// completionProvider: {
			// 	resolveProvider: false
			// },
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
	compilerPath: string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000, compilerPath: "~/caiman/target/debug/hlc" };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'caimanLanguageServer'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
	diagnostics = [];
});

let diagnostics: Diagnostic[] = [];


connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
// documents.onDidChangeContent(change => {
// 	return diagnostics;
// });

// documents.onDidSave(save => {
// 	validateTextDocument(save.document);
// })

documents.onDidOpen(open => {
	validateTextDocument(open.document);
})

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);
	diagnostics = [];

	if (!textDocument.uri.startsWith("file://")) {
		return diagnostics;
	}
	const file_path = textDocument.uri.substring("file://".length);
	try {
		let r = execSync(settings.compilerPath + ' --lower -q -', {
			input: textDocument.getText(),
		});
	} catch (error: any) {
		const stderr = error.stderr.toString();
		let matches = [...stderr.matchAll(new RegExp(/Error: At [^\n]+/g))];
		for (var m of matches) {
			let ln_cols = m.toString().matchAll(new RegExp(/\d+:\d+/g));
			let infos = [];
			for (var info of ln_cols) {
				let ln_col = info.toString().split(":");
				if (ln_col.length == 2) {
					let ln = parseInt(ln_col[0]);
					let col = parseInt(ln_col[1]);
					infos.push({
						line: ln - 1 < 0 ? 0 : ln - 1,
						character: col - 1 < 0 ? 0 : col - 1
					});
				}

			}
			let next_line = "error";
			if (m.index !== undefined) {
				const len = m.toString().length;
				let next = stderr.toString().indexOf("\n", m.index + len + 1);
				if (next !== -1) {
					next_line = stderr.substring(m.index + len, next);
				} else {
					next_line = stderr.substring(m.index + len);
				}
			}
			if (infos.length > 0) {
				const diagnostic: Diagnostic = {
					severity: DiagnosticSeverity.Error,
					range: {
						start: {
							line: infos[0].line,
							character: infos[0].character
						},
						end: {
							line: infos.length > 1 ? infos[infos.length - 1].line : infos[0].line,
							character: infos.length > 1 ? infos[infos.length - 1].character : Number.MAX_VALUE
						}
					},
					message: next_line.trim(),
					source: file_path
				};
				if (hasDiagnosticRelatedInformationCapability && m.index !== undefined) {
					diagnostic.relatedInformation = [
						{
							location: {
								uri: textDocument.uri,
								range: Object.assign({}, diagnostic.range)
							},
							message: stderr.substring(m.index).trim()
						}
					];
				}
				diagnostics.push(diagnostic);
			}
		}
		if (diagnostics.length == 0) {
			const d: Diagnostic = {
				severity: DiagnosticSeverity.Error,
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: Number.MAX_VALUE }
				},
				message: "Unknown error",
				source: file_path,
				relatedInformation: [
					{
						location: {
							uri: textDocument.uri,
							range: {
								start: { line: 0, character: 0 },
								end: { line: 0, character: Number.MAX_VALUE }
							}
						},
						message: stderr.toString()
					}
				]
			};
			diagnostics.push(d);
		}
	}
	// The validator creates diagnostics for all uppercase words length 2 and more
	// const text = textDocument.getText();
	return diagnostics;
}

// connection.onDidChangeWatchedFiles(_change => {
// 	// Monitored files have change in VSCode
// 	connection.console.log('We received a file change event');
// });

// This handler provides the initial list of the completion items.
// connection.onCompletion(
// 	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
// 		// The pass parameter contains the position of the text document in
// 		// which code complete got requested. For the example we ignore this
// 		// info and always provide the same completion items.
// 		return [
// 			{
// 				label: 'TypeScript',
// 				kind: CompletionItemKind.Text,
// 				data: 1
// 			},
// 			{
// 				label: 'JavaScript',
// 				kind: CompletionItemKind.Text,
// 				data: 2
// 			}
// 		];
// 	}
// );

// This handler resolves additional information for the item selected in
// the completion list.
// connection.onCompletionResolve(
// 	(item: CompletionItem): CompletionItem => {
// 		if (item.data === 1) {
// 			item.detail = 'TypeScript details';
// 			item.documentation = 'TypeScript documentation';
// 		} else if (item.data === 2) {
// 			item.detail = 'JavaScript details';
// 			item.documentation = 'JavaScript documentation';
// 		}
// 		return item;
// 	}
// );

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
