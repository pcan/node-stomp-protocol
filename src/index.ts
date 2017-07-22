
import { openStream } from './stream';
import { StompServerCommandListener, StompClientCommandListener, StompServerCommands, StompClientCommands } from './protocol';
import { StompServerSessionLayer, StompClientSessionLayer } from './session';
import { StompFrameLayer } from './frame';
import { StompConfig } from './model';
import { Socket } from 'net';
import * as WebSocket from 'ws';

export * from './protocol'
export * from './model'

export function createStompServerSession(socket: Socket | WebSocket, listener: StompClientCommandListener, config?: StompConfig): StompServerSessionLayer {
    const streamLayer = openStream(socket);
    const frameLayer = new StompFrameLayer(streamLayer);
    frameLayer.headerFilter = config && config.headersFilter || frameLayer.headerFilter;
    return new StompServerSessionLayer(frameLayer, listener);
}

export function createStompClientSession(socket: Socket | WebSocket, listener: StompServerCommandListener, config?: StompConfig): StompClientSessionLayer {
    const streamLayer = openStream(socket);
    const frameLayer = new StompFrameLayer(streamLayer);
    frameLayer.headerFilter = config && config.headersFilter || frameLayer.headerFilter;
    return new StompClientSessionLayer(frameLayer, listener);
}
