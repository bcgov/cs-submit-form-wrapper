import { StreamManager } from '../shared/streamUtils';

const workspaceStream = new StreamManager();

export const addStreamConnection = workspaceStream.addConnection.bind(workspaceStream);
export const emitWorkspaceUpdate = workspaceStream.emitUpdate.bind(workspaceStream);
