import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function DependencyNote({ content }) {
  if (!content) return null;

  return (
    <div className="gcDependencyNote__markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
