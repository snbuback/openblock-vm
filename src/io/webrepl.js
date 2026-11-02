const JSONRPC = require('../util/jsonrpc');

/**
 * A MicroPython WebREPL peripheral socket object. It handles connecting,
 * over the local OpenBlock Link service, to a board's WebREPL endpoint and
 * reading/writing REPL data.
 */
class Webrepl extends JSONRPC {

    /**
     * @param {Runtime} runtime - the Runtime for sending/receiving GUI update events.
     * @param {string} deviceId - the id of the device using this socket.
     * @param {object} peripheralOptions - the list of options for peripheral discovery.
     * @param {object} connectCallback - a callback for connection.
     * @param {object} resetCallback - a callback for resetting extension state.
     */
    constructor (runtime, deviceId, peripheralOptions, connectCallback = null, resetCallback = null) {
        super();

        this._socket = runtime.getScratchLinkSocket('WEBREPL');
        this._socket.setOnOpen(this.requestPeripheral.bind(this));
        this._socket.setOnClose(this.handleDisconnectError.bind(this));
        this._socket.setOnError(this._handleRequestError.bind(this));
        this._socket.setHandleMessage(this._handleMessage.bind(this));

        this._sendMessage = this._socket.sendMessage.bind(this._socket);

        this._availablePeripherals = {};
        this._connectCallback = connectCallback;
        this._connected = false;
        this._onMessage = null;
        this._resetCallback = resetCallback;
        this._discoverTimeoutID = null;
        this._deviceId = deviceId;
        this._peripheralOptions = peripheralOptions;
        this._runtime = runtime;

        this._socket.open();
    }

    /**
     * Request connection to the peripheral. WebREPL has no scan protocol,
     * the host and port are entered by the user, so this only opens the
     * Link session.
     */
    requestPeripheral () {
        this._availablePeripherals = {};
        if (this._discoverTimeoutID) {
            window.clearTimeout(this._discoverTimeoutID);
        }
        this._discoverTimeoutID = window.setTimeout(this._handleDiscoverTimeout.bind(this), 15000);
        this.sendRemoteRequest('discover', this._peripheralOptions)
            .catch(e => {
                this._handleRequestError(e);
            });
    }

    /**
     * Try connecting to the given WebREPL endpoint.
     * @param {string} id - "host:port".
     * @param {object} config - {host, port, password} connection configuration.
     */
    connectPeripheral (id, config) {
        this.sendRemoteRequest('connect', {peripheralId: id, peripheralConfig: config})
            .then(() => {
                this._connected = true;
                this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED);
                if (this._connectCallback) {
                    this._connectCallback();
                }
            })
            .catch(e => {
                this._handleRequestError(e);
            });
    }

    /**
     * Close the websocket.
     */
    disconnect () {
        if (this._connected) {
            this._connected = false;
        }

        if (this._socket.isOpen()) {
            this._socket.close();
        }

        if (this._discoverTimeoutID) {
            window.clearTimeout(this._discoverTimeoutID);
        }

        this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED);
    }

    /**
     * @return {bool} whether the peripheral is connected.
     */
    isConnected () {
        return this._connected;
    }

    /**
     * WebREPL has no baudrate; kept for interface compatibility.
     */
    setBaudrate () {
    }

    /**
     * Start forwarding REPL output.
     * @param {object} onMessage - callback for incoming data.
     * @return {Promise} - a promise from the remote read request.
     */
    read (onMessage = null) {
        if (onMessage) {
            this._onMessage = onMessage;
        }
        return this.sendRemoteRequest('read')
            .catch(e => {
                this.handleDisconnectError(e);
            });
    }

    /**
     * Write console data to the REPL.
     * @param {string} message - the message to send.
     * @param {string} encoding - the message encoding type.
     * @return {Promise} - a promise from the remote send request.
     */
    write (message, encoding = null) {
        const params = {message};
        if (encoding) {
            params.encoding = encoding;
        }
        return this.sendRemoteRequest('write', params)
            .catch(e => {
                this.handleDisconnectError(e);
            });
    }

    /**
     * Upload code to the peripheral.
     * @param {string} message - the code to upload.
     * @param {object} config - the configuration of upload process.
     * @param {string} encoding - the message encoding type.
     * @return {Promise} - a promise from the remote send request.
     */
    upload (message, config, encoding = null) {
        config.library = this._runtime.getCurrentDeviceExtensionLibrary();
        const params = {message, config};
        if (encoding) {
            params.encoding = encoding;
        }
        return this.sendRemoteRequest('upload', params)
            .catch(e => {
                this.handleDisconnectError(e);
            });
    }

    /**
     * Firmware flashing is not possible over WebREPL.
     * @param {object} config - the configuration of upload process.
     * @return {Promise} - a promise from the remote send request.
     */
    uploadFirmware (config) {
        return this.sendRemoteRequest('uploadFirmware', config)
            .catch(e => {
                this.handleDisconnectError(e);
            });
    }

    /**
     * Abort the uploading process.
     * @return {Promise} - a promise from the remote send request.
     */
    abortUpload () {
        return this.sendRemoteRequest('abortUpload')
            .catch(e => {
                this.handleDisconnectError(e);
            });
    }

    /**
     * Execute one Python statement in the board raw REPL.
     * @param {string} command - Python source.
     * @param {number} timeout - response timeout.
     * @param {object} options - execution options.
     * @return {Promise<string>} - command stdout.
     */
    execLive (command, timeout, options = {}) {
        return this.sendRemoteRequest('execLive', {command, timeout, options});
    }

    /**
     * Handle a received call from the socket.
     * @param {string} method - a received method label.
     * @param {object} params - a received list of parameters.
     * @return {object} - optional return value.
     */
    didReceiveCall (method, params) {
        switch (method) {
        case 'didDiscoverPeripheral':
            this._availablePeripherals[params.peripheralId] = params;
            this._runtime.emit(
                this._runtime.constructor.PERIPHERAL_LIST_UPDATE,
                this._availablePeripherals
            );
            if (this._discoverTimeoutID) {
                window.clearTimeout(this._discoverTimeoutID);
            }
            break;
        case 'connectError':
            this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
                message: params.message
            });
            break;
        case 'peripheralUnplug':
            this.handleDisconnectError();
            break;
        case 'onMessage':
            if (this._onMessage) {
                this._onMessage(params.message);
            }
            break;
        case 'uploadStdout':
            this._runtime.emit(
                this._runtime.constructor.PERIPHERAL_UPLOAD_STDOUT, {
                    message: params.message
                });
            break;
        case 'setUploadAbortEnabled':
            this._runtime.emit(
                this._runtime.constructor.PERIPHERAL_SET_UPLOAD_ABORT_ENABLED, params);
            break;
        case 'uploadError':
            this._runtime.emit(
                this._runtime.constructor.PERIPHERAL_UPLOAD_ERROR, {
                    message: params.message
                });
            break;
        case 'uploadSuccess':
            this._runtime.emit(
                this._runtime.constructor.PERIPHERAL_UPLOAD_SUCCESS, params ? params.aborted : false);
            break;
        case 'ping':
            return 42;
        }
    }

    /**
     * Handle an error resulting from losing connection to a peripheral.
     * @param {object} e - error.
     */
    handleDisconnectError (/* e */) {
        if (!this._connected) return;

        this.disconnect();

        if (this._resetCallback) {
            this._resetCallback();
        }

        this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR, {
            message: 'Scratch lost connection to',
            deviceId: this._deviceId
        });
    }

    /**
     * Handle an error resulting from losing connection to a peripheral
     * realtime protocol.
     * @param {string} e - error message.
     */
    handleRealtimeDisconnectError (e) {
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_REALTIME_CONNECTION_LOST_ERROR, {
            message: e,
            deviceId: this._deviceId
        });
    }

    handleRealtimeConnectSucess () {
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_REALTIME_CONNECT_SUCCESS, {deviceId: this._deviceId});
    }

    _handleRequestError (e) {
        let message = 'Scratch lost connection to';
        if (typeof e === 'string') {
            message = e;
        } else if (e && e.message) {
            message = e.message;
        }
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
            message: message,
            deviceId: this._deviceId
        });
    }

    _handleDiscoverTimeout () {
        if (this._discoverTimeoutID) {
            window.clearTimeout(this._discoverTimeoutID);
        }
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_SCAN_TIMEOUT);
    }
}

module.exports = Webrepl;
