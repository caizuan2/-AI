import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const shellFile = ts.createSourceFile(
  "IngestChatGPTShell.tsx",
  readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const pickers: ts.JsxSelfClosingElement[] = [];

function visit(node: ts.Node): void {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(shellFile) === "IngestGPTModelPicker") {
    pickers.push(node);
  }
  ts.forEachChild(node, visit);
}

visit(shellFile);
assert.equal(pickers.length, 1, "投喂聊天页应保留唯一的顶部模型选择器。");

const picker = pickers[0];
const header = picker.parent;
assert.ok(ts.isJsxElement(header), "必须检查模型选择器实际所属的 header，而不是其它容器。");
assert.equal(header.openingElement.tagName.getText(shellFile), "div");

const headerClassName = header.openingElement.attributes.properties.find(
  (attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText(shellFile) === "className"
);
assert.ok(headerClassName?.initializer && ts.isJsxExpression(headerClassName.initializer));
const classExpression = headerClassName.initializer.expression;
assert.ok(classExpression && ts.isCallExpression(classExpression));
assert.ok(ts.isPropertyAccessExpression(classExpression.expression));
assert.equal(classExpression.expression.name.text, "join");
const classList = classExpression.expression.expression;
assert.ok(ts.isArrayLiteralExpression(classList) && ts.isStringLiteral(classList.elements[0]));
const headerClasses = classList.elements[0].text.split(/\s+/);

assert.ok(headerClasses.includes("relative"));
assert.ok(headerClasses.includes("overflow-visible"), "顶部 header 必须允许模型菜单展开到聊天区域。");
assert.ok(!headerClasses.some((className) => /^overflow(?:-[xy])?-(?:hidden|clip|auto|scroll)$/.test(className)), "模型菜单的 header 祖先不能裁剪下拉菜单。");
assert.ok(headerClasses.includes("z-[35]"), "模型菜单 header 应在回底按钮 z-30 之上、历史抽屉 z-40 之下。");

const pickerAttributes = picker.attributes.getText(shellFile);
assert.match(pickerAttributes, /\bcompact\b/);
assert.match(pickerAttributes, /align="right"/);
assert.match(pickerAttributes, /menuPlacement="below"/);
assert.match(pickerAttributes, /disabled=\{isParsing\}/, "生成期间禁用模型切换的行为保持不变。");

console.log("Admin ingest model menu layering tests passed.");
