const OpenBlockMicroPythonEsp32Device = require('../microPythonEsp32/microPythonEsp32');

/**
 * The list of USB device filters for ESP32-S3 boards.
 * @readonly
 */
const PNPID_LIST = [
    // CH340
    'USB\\VID_1A86&PID_7523',
    // CH343
    'USB\\VID_1A86&PID_55D3',
    // CH9102
    'USB\\VID_1A86&PID_55D4',
    // CP2102
    'USB\\VID_10C4&PID_EA60',
    // Espressif built-in USB serial/JTAG
    'USB\\VID_303A&PID_1001'
];

/**
 * Configuration for the micropython uploader in OpenBlock Link.
 * The esp32-s3 firmware is flashed to 0x0 (the classic esp32 uses 0x1000).
 * @readonly
 */
const DIVECE_OPT = {
    type: 'microPython'
};

/**
 * ESP32-S3 usable GPIO pins. GPIO22-25 do not exist, GPIO26-32 are used by
 * the internal flash (octal flash/PSRAM modules additionally claim
 * GPIO33-37, so 35-37 are only usable on quad modules), GPIO19/20 are the
 * USB D-/D+ pins (native USB serial/JTAG, keep them free so the Web Serial
 * transport keeps working), GPIO43/44 are UART0 TX/RX, GPIO45/46 are strap
 * pins. GPIO47/48 are listed because the onboard WS2812 of the common
 * DevKitC-1 boards sits on GPIO48.
 */
const Pins = {
    IO0: '0',
    IO1: '1',
    IO2: '2',
    IO3: '3',
    IO4: '4',
    IO5: '5',
    IO6: '6',
    IO7: '7',
    IO8: '8',
    IO9: '9',
    IO10: '10',
    IO11: '11',
    IO12: '12',
    IO13: '13',
    IO14: '14',
    IO15: '15',
    IO16: '16',
    IO17: '17',
    IO18: '18',
    IO21: '21',
    IO35: '35',
    IO36: '36',
    IO37: '37',
    IO38: '38',
    IO39: '39',
    IO40: '40',
    IO41: '41',
    IO42: '42',
    IO43: '43',
    IO44: '44',
    IO47: '47',
    IO48: '48'
};

const PIN_MENU_ITEMS = Object.keys(Pins).map(key => ({
    text: key,
    value: Pins[key]
}));

/**
 * OpenBlock blocks to interact with a MicroPython esp32-s3 peripheral over
 * a OpenBlock Link client socket. Shares the block set with the esp32
 * device, minus DAC (the S3 has none) but keeping touch (TOUCH1-14 on
 * GPIO1-14), with S3 pin menus.
 */
class OpenBlockMicroPythonEsp32S3Device extends OpenBlockMicroPythonEsp32Device {
    /**
     * @return {string} - the ID of this extension.
     */
    get DEVICE_ID () {
        return 'microPythonEsp32S3';
    }

    get HAS_DAC () {
        return false;
    }

    get HAS_TOUCH () {
        return true;
    }

    get DEFAULT_TRIG_PIN () {
        return Pins.IO5;
    }

    get DEFAULT_ECHO_PIN () {
        return Pins.IO6;
    }

    get PINS_MENU () {
        return PIN_MENU_ITEMS;
    }

    get OUT_PINS_MENU () {
        return PIN_MENU_ITEMS;
    }

    get ANALOG_PINS_MENU () {
        // ADC1 channels 0-9 on GPIO1-10. ADC2 (GPIO11-20) conflicts with Wi-Fi.
        return PIN_MENU_ITEMS.filter(item => {
            const pin = Number(item.value);
            return pin >= 1 && pin <= 10;
        });
    }

    get TOUCH_PINS_MENU () {
        // Touch sensor channels TOUCH1-TOUCH14 live on GPIO1-14.
        return PIN_MENU_ITEMS.filter(item => {
            const pin = Number(item.value);
            return pin >= 1 && pin <= 14;
        });
    }

    /**
     * USB pnp id list of the S3, used by the peripheral constructor of the
     * parent class.
     * @return {Array.<string>} - the pnp id list.
     */
    get PNPID_LIST () {
        return PNPID_LIST;
    }

    /**
     * Uploader options of the S3, used by the peripheral constructor of
     * the parent class.
     * @return {object} - the device options.
     */
    get DIVECE_OPT () {
        return DIVECE_OPT;
    }
}

module.exports = OpenBlockMicroPythonEsp32S3Device;
