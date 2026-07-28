export default function PrBadge({ repoFullName, prNumber, stopPropagation = false }) {
  if (!prNumber) return null;

  const base = 'px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded';

  if (repoFullName) {
    return (
      <a
        href={`https://github.com/${repoFullName}/pull/${prNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
        className={`${base} hover:bg-purple-200 hover:underline`}
        title="Open pull request on GitHub"
      >
        PR #{prNumber}
      </a>
    );
  }

  return <span className={base}>PR #{prNumber}</span>;
}
