import { StompFrame, StompError } from './model';
import { StompFrameLayer } from './frame';


export class StompSessionLayer {

    constructor(private readonly frameLayer: StompFrameLayer) {
        /*frameLayer.emitter.frameEmitter.onEvent((frame) => this.onFrame(frame));
        frameLayer.emitter.errorEmitter.onEvent((err) => this.onError(err));
        frameLayer.emitter.endEmitter.onEvent(() => this.onEnd());
*/
    }

    private onFrame(frame: StompFrame) {

    }

    private onError(error: StompError) {

    }

    private onEnd() {

    }

}
