import { StompFrameLayer } from "./frame";
import { StompFrame, StompError } from "./model";
import { clearInterval } from "timers";

export interface IHeartbeatOptions {
    outgoingPeriod: number;
    incomingPeriod: number;
}

export class Heartbeat {

    public static defaultOptions: IHeartbeatOptions = { outgoingPeriod: 0, incomingPeriod: 0 };

    options: IHeartbeatOptions;
    optionsString = `${this.options.outgoingPeriod},${this.options.incomingPeriod}`;

    incomingPeriod?: number;
    outgoingPeriod?: number;

    lastIncoming: number = 0;

    incomingTimer?: NodeJS.Timer;
    outgoingTimer?: NodeJS.Timer;

    constructor(
        private readonly frameLayer: StompFrameLayer,
        options: IHeartbeatOptions = Heartbeat.defaultOptions) {

        this.options = options;
        this.frameLayer.emitter.on("frame", (frame) => this.onFrame(frame));
    }

    onFrame(frame: StompFrame) {
        if (frame.command === "CONNECT" || frame.command === "CONNECTED") {
            const heartbeat = frame.headers["heart-beat"];
            if (!heartbeat) {
                return;
            }

            this.init(heartbeat);
        }

        this.lastIncoming = Date.now();
    }

    init(heartbeat: string) {
        const [remoteOutgoingPeriod, remoteIncomingPeriod] = heartbeat.split(",").map(s => Number(s));

        const localIncomingPeriod = this.options.incomingPeriod;
        if (localIncomingPeriod > 0 && remoteOutgoingPeriod > 0) {
            this.incomingPeriod = Math.max(localIncomingPeriod, remoteOutgoingPeriod);
            this.setupIncomingTimer();
        }

        const localOutgoingPeriod = this.options.outgoingPeriod;
        if (localOutgoingPeriod > 0 && remoteIncomingPeriod > 0) {
            this.outgoingPeriod = Math.max(localOutgoingPeriod, remoteIncomingPeriod);
            this.setupOutgoingTimer();
        }
    }

    setupOutgoingTimer() {
        const period = this.outgoingPeriod;
        if (period && period > 0) {
            this.outgoingTimer = setInterval(() => {
                const eol = "\0";
                this.frameLayer.stream.send(eol);
            }, period);
        }
    }

    resetupOutgoingTimer() {
        this.resetTimer(this.outgoingTimer);
        this.setupOutgoingTimer();
    }

    resetTimer(timer?: NodeJS.Timer) {
        timer && clearInterval(timer);
    }

    setupIncomingTimer() {
        const period = this.incomingPeriod;
        if (period && period > 0) {
            this.incomingTimer = setInterval(() => {
                const delta = Date.now() - this.lastIncoming;
                if (delta > 2 * period && this.lastIncoming > 0) {
                    this.frameLayer.error(new StompError(`No heartbeat for the last 2*${period} ms`));
                    this.resetTimer(this.incomingTimer);
                    this.resetTimer(this.outgoingTimer);
                    this.frameLayer.close();
                }
            }, period);
        }
    }

}
