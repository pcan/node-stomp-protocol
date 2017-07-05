import {StompFrame, StompSessionData } from './model';

export type StompValidator = (frame: StompFrame, sessionData?: StompSessionData) => StompValidationResult;

export interface StompValidationResult {
    isValid: boolean;
    message?: string;
    details?: string;
};

const validationOk: StompValidationResult = { isValid: true };

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
