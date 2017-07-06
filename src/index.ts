import { openStream } from './stream';
import { StompServerCommandListener, StompClientCommandListener, StompServerCommands, StompClientCommands } from './protocol';
import { StompServerSessionLayer, StompClientSessionLayer } from './session';
import { StompFrameLayer } from './frame';
import { Socket } from 'net';
import * as WebSocket from 'ws';

export { StompServerCommandListener, StompClientCommandListener, StompServerCommands, StompClientCommands } from './protocol';

export function createStompServerSession(socket: Socket | WebSocket, listener: StompClientCommandListener): StompServerCommands {
    const streamLayer = openStream(socket);
    const frameLayer = new StompFrameLayer(streamLayer);
    return new StompServerSessionLayer(frameLayer, listener);
}

export function createStompClientSession(socket: Socket | WebSocket, listener: StompServerCommandListener): StompClientCommands {
    const streamLayer = openStream(socket);
    const frameLayer = new StompFrameLayer(streamLayer);
    return new StompClientSessionLayer(frameLayer, listener);
}
