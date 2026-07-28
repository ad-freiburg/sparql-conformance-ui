export default function CommitShaLink({
  repoFullName,
  commitSha,
  linkClassName,
  codeClassName,
  stopPropagation = false,
  title = 'Open commit on GitHub',
  emptyLabel = 'no-sha',
}) {
  const hasRepoAndSha = repoFullName && commitSha;
  const shortSha = commitSha ? commitSha.substring(0, 8) : emptyLabel;

  if (hasRepoAndSha) {
    const commitUrl = `https://github.com/${repoFullName}/commit/${commitSha}`;

    return (
      <a
        href={commitUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
        className={linkClassName}
        title={title}
      >
        {shortSha}
      </a>
    );
  }

  return <code className={codeClassName}>{shortSha}</code>;
}
