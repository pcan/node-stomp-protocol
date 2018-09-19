import { openStream } from './stream';
import { StompServerCommandListener, StompClientCommandListener } from './protocol';
import {
    StompServerSessionLayer, StompClientSessionLayer,
    StompClientCommandListenerConstructor, StompServerCommandListenerConstructor
} from './session';
import { WebSocket } from './utils';
import { StompFrameLayer } from './frame';
import { StompConfig } from './model';
import { Socket } from 'net';
export { StompServerSessionLayer, StompClientSessionLayer };
export * from './protocol'
export * from './model'
export { setLoggingListeners, LoggerFunction, StompProtocolLoggingListeners } from './utils'

export function createStompServerSession(socket: Socket | WebSocket, listener: StompClientCommandListenerConstructor | StompClientCommandListener, config?: StompConfig): StompServerSessionLayer {
    const streamLayer = openStream(socket);
    const frameLayer = new StompFrameLayer(streamLayer);
    frameLayer.headerFilter = config && config.headersFilter || frameLayer.headerFilter;
    return new StompServerSessionLayer(frameLayer, listener);
}

export function createStompClientSession(socket: Socket | WebSocket, listener: StompServerCommandListenerConstructor | StompServerCommandListener, config?: StompConfig): StompClientSessionLayer {
    const streamLayer = openStream(socket);
    const frameLayer = new StompFrameLayer(streamLayer);
    frameLayer.headerFilter = config && config.headersFilter || frameLayer.headerFilter;
    return new StompClientSessionLayer(frameLayer, listener);
}
