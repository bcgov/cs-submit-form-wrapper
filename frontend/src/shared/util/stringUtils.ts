export function capitalizeFirstLetter(str: string) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function convertSubmissionIdToConfirmationId(submissionId: string): string {
  const indexOfHyphen = submissionId.indexOf('-');
  if (indexOfHyphen !== -1) {
    return submissionId.substring(0, indexOfHyphen);
  }
  return submissionId;
}
