/**
 * Presence of human specialists signed in to the dashboard Live Console.
 * Keyed by clientId so a merchant's visitors are only ever routed to that merchant's team.
 *
 * Note: in-memory, like the call orchestrators. On a multi-node deployment the
 * console and the visitor's call must land on the same node (sticky sessions).
 */
const onlineAgents = new Map(); // clientId -> Map(socketId -> { name })

export function agentRoom(clientId) {
    return `agents:${clientId}`;
}

export function addAgent(clientId, socketId, name) {
    if (!onlineAgents.has(clientId)) onlineAgents.set(clientId, new Map());
    onlineAgents.get(clientId).set(socketId, { name });
}

export function removeAgent(clientId, socketId) {
    const agents = onlineAgents.get(clientId);
    if (!agents) return;
    agents.delete(socketId);
    if (agents.size === 0) onlineAgents.delete(clientId);
}

export function hasOnlineAgents(clientId) {
    return (onlineAgents.get(clientId)?.size || 0) > 0;
}

export function onlineAgentCount(clientId) {
    return onlineAgents.get(clientId)?.size || 0;
}
