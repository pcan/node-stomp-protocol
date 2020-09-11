import { StompEventEmitter } from './model';
import { log, WebSocket, WebSocketMessageHandler } from './utils';
import { Socket } from 'net';

export type StompStreamEvent = 'data' | 'end';

export interface StompStreamLayer {

    emitter: StompEventEmitter<StompStreamEvent>;

    send(data: string): Promise<void>;

    close(): Promise<void>;

}

export function openStream(socket: Socket | WebSocket): StompStreamLayer {
    if (socket instanceof Socket) {
        return new StompSocketStreamLayer(socket);
    }
    if (isWebSocket(socket)) {
        return new StompWebSocketStreamLayer(socket);
    }
    throw new Error('Unsupported socket type');
}

function isWebSocket(socket: any): socket is WebSocket {
    return !!socket &&
        typeof socket.on === "function" &&
        typeof socket.send === "function" &&
        typeof socket.close === "function" &&
        socket.CLOSED === 3 &&
        socket.CLOSING === 2 &&
        socket.OPEN === 1 &&
        socket.CONNECTING === 0;
}

class StompSocketStreamLayer implements StompStreamLayer {

    public emitter = new StompEventEmitter();

    constructor(private readonly socket: Socket) {
        log.debug("StompSocketStreamLayer: new connection %s", socket.remoteAddress);
        this.socket.on('data', (data) => this.onSocketData(data));
        this.socket.on('error', (err) => this.onSocketEnd(err));
        this.socket.on('close', () => this.onSocketEnd());
    }

    private onSocketData(data: Buffer) {
        log.silly("StompSocketStreamLayer: received data %j", data);
        if (this.emitter) {
            this.emitter.emit('data', data);
        }
    }

    private onSocketEnd(err?: Error) {
        try {
            log.debug("StompSocketStreamLayer: socket closed due to error %O", err);
            if (this.emitter) {
                this.emitter.emit('end', err);
            }
        } finally {
            this.socket.end();
        }
    }

    public async send(data: string): Promise<any> {
        log.silly("StompSocketStreamLayer: sending data %j", data);
        return new Promise((resolve, reject) => {
            try {
                this.socket.write(data, resolve);
            } catch (err) {
                log.debug("StompSocketStreamLayer: error while sending data %O", err);
                reject(err);
            }
        });
    }

    public async close(): Promise<any> {
        log.debug("StompSocketStreamLayer: closing");
        return new Promise((resolve, reject) => {
            try {
                this.socket.end(resolve);
            } catch (err) {
                log.debug("StompSocketStreamLayer: error while closing %O", err);
                reject(err);
            }
        });
    }

}

class StompWebSocketStreamLayer implements StompStreamLayer {

    public emitter = new StompEventEmitter();
    private readonly messageListener: WebSocketMessageHandler = (event) => this.onWsMessage(event.data);
    private readonly errorListener = (event: any) => this.onWsEnd(event);
    private readonly closeListener = (code?: number) => this.onWsEnd({ code });

    constructor(private readonly webSocket: WebSocket) {
        log.debug("StompWebSocketStreamLayer: new connection");
        this.webSocket.addEventListener('message', this.messageListener);
        this.webSocket.addEventListener('error', this.errorListener);
        this.webSocket.addEventListener('close', this.closeListener);
    }

    private onWsMessage(data: any) {
        log.silly("StompWebSocketStreamLayer: received data %O", data);
        this.emitter.emit('data', new Buffer(data.toString()));
    }

    private removeListeners() {
        this.webSocket.removeEventListener('message', this.messageListener);
        this.webSocket.removeEventListener('error', this.errorListener);
        this.webSocket.removeEventListener('close', this.closeListener);
    }

    private onWsEnd(event: any) {
        log.debug("StompWebSocketStreamLayer: WebSocket closed %O", event);
        this.wsClose();
    }

    public async send(data: string): Promise<any> {
        log.silly("StompWebSocketStreamLayer: sending data %j", data);
        return new Promise((resolve, reject) => {
            try {
                this.webSocket.send(data);
            } catch (err) {
                log.debug("StompWebSocketStreamLayer: error while sending data %O", err);
                reject(err);
            } finally {
                resolve();
            }
        });
    }

    public async close(): Promise<any> {
        log.debug("StompWebSocketStreamLayer: closing");
        return new Promise((resolve, reject) => {
            try {
                this.wsClose();
            } catch (err) {
                log.debug("StompWebSocketStreamLayer: error while closing %O", err);
                reject(err);
            } finally {
                resolve();
            }
        });
    }

    private wsClose() {
        this.removeListeners();
        this.emitter.emit('end');
        this.webSocket.close();
    }

}
