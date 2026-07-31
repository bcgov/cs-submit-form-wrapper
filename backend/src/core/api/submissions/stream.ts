import { StreamManager } from '../shared/streamUtils';

const submissionStream = new StreamManager();
const submissionDataStream = new StreamManager();

export const addStreamConnection = submissionStream.addConnection.bind(submissionStream);
export const emitSubmissionsUpdate = submissionStream.emitUpdate.bind(submissionStream);

export const addDataStreamConnection = submissionDataStream.addConnection.bind(submissionDataStream);
export const emitSubmissionDataUpdate = submissionDataStream.emitUpdate.bind(submissionDataStream);
