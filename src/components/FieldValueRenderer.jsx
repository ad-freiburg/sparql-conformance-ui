import { isResultField, getRedHtmlContent } from '../utils/testDetailsHelpers';

/**
 * Renders a field value with HTML handling and toggle support
 * Only applies toggle effects to result fields (expectedResult, queryResult, etc.)
 */
export default function FieldValueRenderer({ 
  entry, 
  test, 
  toggleMatching = false, 
  toggleIntended = false 
}) {
  if (!entry?.value) {
    return <span className="text-gray-400">N/A</span>;
  }

  const htmlContent = entry.value;
  const wrapperClass = `html-content bg-gray-100 text-gray-900 p-3 rounded border overflow-auto`;
  
  const isResult = isResultField(entry.key);
  
  if (!isResult) {
    return (
      <div className={wrapperClass}>
        <pre dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    );
  }

  // apply toggle logic
  // Toggle Matching: when OFF show normalText, when ON show redText
  const normalTextClass = toggleMatching ? 'normalText visually-hidden' : 'normalText';
  const redTextClass = toggleMatching ? 'redText' : 'redText visually-hidden';
  
  // Toggle Intended: when ON, hide yellow labels via data attribute
  const wrapperDataAttr = toggleIntended ? { 'data-hide-yellow': 'true' } : {};
  
  const redHtmlContent = getRedHtmlContent(test, entry.key);
  
  return (
    <div className={wrapperClass} {...wrapperDataAttr}>
      <pre 
        className={normalTextClass}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
      {/* Show red-only version when available */}
      {redHtmlContent && (
        <pre 
          className={redTextClass}
          dangerouslySetInnerHTML={{ __html: redHtmlContent }}
        />
      )}
    </div>
  );
}
