import { StompFrame, StompError, StompSessionData } from './model';
import { StompFrameLayer } from './frame';
import { StompCommandListener, StompClientCommandListener, StompCommand, StompCommands } from './protocol';
import { StompValidator, StompValidationResult } from './validators';


export interface StompSession<L extends StompCommandListener> {
    frameLayer: StompFrameLayer;
    listener: L;
}

abstract class StompSessionLayer<L extends StompCommandListener> implements StompSession<L> {

    protected abstract get allowedCommands(): StompCommands<L>;

    constructor(public readonly frameLayer: StompFrameLayer, protected readonly data: StompSessionData, public readonly listener: L) {
        frameLayer.emitter.on('frame', (frame) => this.onFrame(frame));
        frameLayer.emitter.on('error', (error) => this.onError(error));
        frameLayer.emitter.on('end', () => this.onEnd());
    }

    private onFrame(frame: StompFrame) {
        if (this.isValidCommand(frame.command)) {
            const command = this.allowedCommands[frame.command];
            const validators = command.validators;
            let validation: StompValidationResult;
            for (let validator of validators) {
                validation = validator(frame, this.data);
                if (!validation.isValid) {
                    this.onError(new StompError(validation.message, validation.details));
                    return;
                }
            }
            this.handleFrame(command, frame);
        } else {
            this.onError(new StompError('No such command', `Unrecognized Command '${frame.command}'`));
        }
    }

    protected handleFrame(command: StompCommand<L>, frame: StompFrame) {
        command.handle(frame, this);
    }

    protected abstract onError(error: StompError): void;

    protected abstract onEnd(): void;

    private isValidCommand(command: string) {
        return (command && command.length < 20 && this.allowedCommands[command]);
    }

}

/*
export class StompServerSessionLayer extends StompSessionLayer<StompClientListener> {

    constructor(frameLayer: StompFrameLayer, data: StompSessionData, listener: StompClientListener) {
        super(frameLayer, data, listener);
    }


}
*/
