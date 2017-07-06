import { StompFrame, StompEventEmitter } from './model';
import { EventEmitter } from 'events';
import { Socket } from 'net';
import * as WebSocket from 'ws';

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
    if (socket instanceof WebSocket) {
        return new StompWebSocketStreamLayer(socket);
    }
    throw new Error('Unsupported socket type');
}

class StompSocketStreamLayer implements StompStreamLayer {

    public emitter = new StompEventEmitter();

    constructor(private readonly socket: Socket) {
        this.socket.on('data', (data) => this.onSocketData(data));
        this.socket.on('error', (err) => this.onSocketEnd(err));
        this.socket.on('end', () => this.onSocketEnd());
    }

    private onSocketData(data: Buffer) {
        if (this.emitter) {
            this.emitter.emit('data', data);
        }
        //frameEmitter.handleData(data);
    }

    private onSocketEnd(err?: Error) {
        try {
            if (this.emitter) {
                this.emitter.emit('end', err);
            }
            // subscriptions.map(function(queue) {
            //   queueManager.unsubscribe(queue, sessionId);
            // });
        } finally {
            this.socket.end();
        }
    }

    public async send(data: string): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                this.socket.write(data, resolve);
            } catch (err) {
                reject(err);
            }
        });
    }

    public async close(): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                this.socket.end(resolve);
            } catch (err) {
                reject(err);
            }
        });
    }

}

class StompWebSocketStreamLayer implements StompStreamLayer {

    public emitter = new StompEventEmitter();

    constructor(private readonly webSocket: WebSocket) {
        this.webSocket.on('message', (data) => this.onWsMessage(data));
        this.webSocket.on('error', (err) => this.onWsEnd(err));
        this.webSocket.on('close', () => this.onWsEnd());
    }

    private onWsMessage(data: WebSocket.Data) {
        if (this.emitter) {
            this.emitter.emit('data', new Buffer(data.toString()));
        }
    }

    private onWsEnd(err?: Error) {
        try {
            if (this.emitter) {
                this.emitter.emit('end', err);
            }
        } finally {
            this.webSocket.close();
        }
    }

    public async send(data: string): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                this.webSocket.send(data);
            } catch (err) {
                reject(err);
            } finally {
                resolve();
            }
        });
    }

    public async close(): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                this.webSocket.close();
            } catch (err) {
                reject(err);
            } finally {
                resolve();
            }
        });
    }

}
