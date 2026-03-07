"use client";

import { Code } from "@repo/ui/code";
import ReactMarkdown from "react-markdown";

type MarkdownViewerProps = {
  markdown: string;
};

export function MarkdownViewer({ markdown }: MarkdownViewerProps) {
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-950 p-3.5">
      <ReactMarkdown
        components={{
          h1({ children }) {
            return <h1 className="mb-3 mt-1 text-xl font-semibold text-slate-100">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mb-2 mt-4 text-lg font-semibold text-slate-100">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mb-2 mt-3 text-base font-semibold text-slate-100">{children}</h3>;
          },
          p({ children }) {
            return <p className="mb-2 leading-relaxed text-slate-200">{children}</p>;
          },
          ul({ children }) {
            return <ul className="mb-2 list-disc space-y-1 pl-5 text-slate-200">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-2 list-decimal space-y-1 pl-5 text-slate-200">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                className="text-blue-300 underline underline-offset-2 hover:text-blue-200"
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-2 border-slate-600 pl-3 italic text-slate-300">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="my-3 border-slate-700" />;
          },
          pre({ children }) {
            return (
              <pre className="my-2 overflow-x-auto rounded-md border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-100">
                {children}
              </pre>
            );
          },
          code({ children }) {
            return <Code>{children}</Code>;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
