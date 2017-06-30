import { StompFrame, StompEventEmitter } from "./model";
import { EventEmitter } from "events";
import { Socket } from "net";

export interface StompStreamLayer {

    emitter: StompStreamEventEmitter;
    send(data: string): void;
    close(): void;

}


export class StompStreamEventEmitter {

    private readonly emitter = new EventEmitter();
    public readonly dataEmitter = new StompEventEmitter(this.emitter, 'data');
    public readonly endEmitter = new StompEventEmitter(this.emitter, 'end');

}


export function openStompStream(socket: Socket, emitter: StompStreamEventEmitter): StompStreamLayer {

    return new StompSocketStreamLayer(socket, emitter);

}


class StompSocketStreamLayer implements StompStreamLayer {

    constructor(private readonly socket: Socket, public emitter: StompStreamEventEmitter) {
        this.socket.on('data', (data) => this.onSocketData(data));
        this.socket.on('end', () => this.onSocketEnd());
    }

    private onSocketData(data: string) {
        if (this.emitter) {
            this.emitter.dataEmitter.emit(data);
        }
        //frameEmitter.handleData(data);
    }

    private onSocketEnd() {
        try {
            if (this.emitter) {
                this.emitter.endEmitter.emit();
            }
            // subscriptions.map(function(queue) {
            //   queueManager.unsubscribe(queue, sessionId);
            // });
        } finally {
            this.socket.end();
        }
    }

    public send(data: string) {
        this.socket.write(data);
    }

    public close() {
        this.socket.end();
    }

}
