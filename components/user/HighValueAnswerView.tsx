import { cn } from "@/lib/utils";

interface HighValueAnswerViewProps {
  content?: string | null;
  className?: string;
}

function normalize(content?: string | null) {
  return typeof content === "string"
    ? content.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : "";
}

function isTableLine(line: string) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function splitTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTextBlock(block: string, index: number) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const tableLines = lines.filter(isTableLine);

  if (tableLines.length >= 2) {
    const rows = tableLines
      .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
      .map(splitTableCells);
    const [header, ...body] = rows;

    return (
      <div key={`table-${index}`} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              {header?.map((cell) => (
                <th key={cell} className="border-b border-slate-200 px-3 py-2 font-semibold">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={`${row.join("-")}-${rowIndex}`} className="odd:bg-white even:bg-slate-50/70">
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className="border-b border-slate-100 px-3 py-2 align-top leading-6 text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div key={`text-${index}`} className="space-y-2 text-[15px] leading-7 text-slate-800">
      {lines.map((line) => {
        const heading = line.replace(/^#{1,6}\s*/, "").trim();
        const bullet = line.match(/^\s*[-*•]\s+(.+)/);
        const ordered = line.match(/^\s*\d+[.、]\s+(.+)/);

        if (/^#{1,6}\s+/.test(line) || /^【.+】$/.test(line)) {
          return <p key={line} className="pt-1 text-base font-semibold text-slate-950">{heading}</p>;
        }

        if (bullet?.[1] || ordered?.[1]) {
          return (
            <p key={line} className="flex gap-2">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>{bullet?.[1] ?? ordered?.[1]}</span>
            </p>
          );
        }

        return <p key={line}>{line}</p>;
      })}
    </div>
  );
}

export function HighValueAnswerView({ content, className }: HighValueAnswerViewProps) {
  const text = normalize(content);

  if (!text) {
    return null;
  }

  const blocks = text.split(/\n{2,}/).filter(Boolean);

  return (
    <section className={cn("space-y-4 rounded-2xl bg-white text-slate-900", className)}>
      {blocks.map(renderTextBlock)}
    </section>
  );
}
