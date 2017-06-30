import { StompFrame, StompEventEmitter } from "./model";

import { Socket } from "net";

export interface StompStreamLayer {

    emitter: StompEventEmitter<'streamData' | 'streamEnd'>;
    send(data: Buffer): void;
    close(): void;

}

class StompSocketStreamLayer implements StompStreamLayer {

    constructor(private readonly socket: Socket, public emitter: StompEventEmitter<'streamData' | 'streamEnd'>) {
        this.socket.on('data', this.onSocketData);
        this.socket.on('end', this.onSocketEnd);
    }

    private onSocketData(data: string) {
        if (this.emitter) {
            this.emitter.emitEvent('streamData', data);
        }
        //frameEmitter.handleData(data);
    }

    private onSocketEnd() {
        try {
            if (this.emitter) {
                this.emitter.emitEvent('streamEnd');
            }
            // subscriptions.map(function(queue) {
            //   queueManager.unsubscribe(queue, sessionId);
            // });
        } finally {
            this.socket.end();
        }
    }

    public send(data: Buffer) {
        this.socket.write(data);
    }

    public close() {
        this.socket.end();
    }

}
