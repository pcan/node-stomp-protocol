import { StompFrame, validationOk } from './model';


function isPresent(value: any) {
    return typeof value !== 'undefined' && value !== null;
}

export function requireHeader(headerName: string) {
    return (frame: StompFrame) => {
        if (isPresent(frame.headers[headerName])) {
            return validationOk;
        }
        return {
            isValid: false,
            message: `Header '${headerName}' is required for ${frame.command}`,
            details: 'Frame: ' + frame.toString()
        };;
    };
}

export function requireOneHeader(...headerNames: string[]) {
    return (frame: StompFrame) => {
        for (var headerName in headerNames) {
            if (isPresent(frame.headers[headerName])) {
                return validationOk;
            }
        }
        return {
            isValid: false,
            message: `One of the following Headers '${headerNames.join(', ')}' is \
                required for ${frame.command}`,
            details: 'Frame: ' + frame.toString()
        };
    };
}

export function requireAllHeaders(...headerNames: string[]) {
    return (frame: StompFrame) => {
        for (var headerName in headerNames) {
            if (!isPresent(frame.headers[headerName])) {
                return {
                    isValid: false,
                    message: `Header '${headerName}' is required for ${frame.command}`,
                    details: 'Frame: ' + frame.toString()
                };
            }
        }
        return validationOk;
    };
}

export function headerMatchesRegex(headerName: string, regex: RegExp) {
    return (frame: StompFrame) => {
        var headerValue = frame.headers[headerName];
        if (typeof headerValue !== 'string' || !headerValue.match(regex)) {
            return {
                isValid: false,
                message: `Header '${headerName}' has value '${headerValue}' which \
                    does not match against the following regex: \
                    '${regex}'`,
                details: 'Frame: ' + frame.toString()
            };
        }
        return validationOk;
    };
}


/*

class StompFrameValidator {

    private readonly allowedCommandNames: string[];

    constructor(private allowedCommands: StompCommands) {
        this.allowedCommandNames = Object.keys(this.allowedCommands);
    }

    public isValidCommand(command: string) {
        return (command && command.length < 20 && this.allowedCommandNames.indexOf(command) > -1);
    }

    public validate(frame: StompFrame) {
        const validators = this.allowedCommands[frame.command];
        var result;
        for (var validator of validators) {
            result = validator(frame);
            if (!result.isValid) {
                return result;
            }
        }
        return validationOk;
    }

}


*/
