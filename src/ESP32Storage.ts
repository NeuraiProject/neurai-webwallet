class ESP32WebUSBStorage {
    port: SerialPort | null;
    reader: ReadableStreamDefaultReader<string> | null;
    writer: WritableStreamDefaultWriter<string> | null;
    readableStreamClosed: Promise<void> | null;
    writableStreamClosed: Promise<void> | null;
    readBuffer: string;
    isReading: boolean;
    responseQueue: any[];

    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        this.readBuffer = '';
        this.isReading = false;
        this.responseQueue = [];
    }

    async connect() {
        try {
            // Request serial port with USB filter
            // Common USB-Serial chips for ESP32: CP2102, CH340, FTDI, etc.
            const filters = [
                { usbVendorId: 0x10C4 }, // CP210x (Silicon Labs)
                { usbVendorId: 0x1A86 }, // CH340 (WCH)
                { usbVendorId: 0x0403 }, // FTDI
                { usbVendorId: 0x067B }, // Prolific
                { usbVendorId: 0x303A }, // ESP32-S2/S3 native USB
            ];
            
            this.port = await (navigator as any).serial.requestPort({ filters });
            
            console.log('Port selected:', this.port);
            
            if (!this.port) {
                throw new Error('Could not get serial port');
            }
            
            // Open with standard configuration
            await this.port.open({ 
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none',
                bufferSize: 8192 // Larger buffer
            } as any);

            console.log('Port opened successfully');

            // Configure writer
            const encoder = new TextEncoderStream();
            this.writableStreamClosed = encoder.readable.pipeTo(this.port.writable as any);
            this.writer = encoder.writable.getWriter();

            // Configure reader
            const decoder = new TextDecoderStream();
            this.readableStreamClosed = (this.port.readable as any).pipeTo(decoder.writable);
            this.reader = decoder.readable.getReader();

            console.log('Streams configured');
            
            // Start continuous background reading
            this.startReading();

            console.log('ESP32 connected via Web Serial API');
            
            // Wait a bit for connection to stabilize
            await this.delay(500);
            
            // Clear initial buffer (may have welcome messages)
            this.readBuffer = '';
            await this.delay(200);
            
            return true;
        } catch (error) {
            console.error('Error in connect():', error);
            throw error;
        }
    }

    async disconnect() {
        this.isReading = false;
        
        if (this.reader) {
            try {
                await this.reader.cancel();
            } catch (e) {
                console.warn('Error canceling reader:', e);
            }
            try {
                await this.readableStreamClosed!.catch(() => {});
            } catch (e) {
                console.warn('Error closing readable stream:', e);
            }
            this.reader = null;
        }

        if (this.writer) {
            try {
                await this.writer.close();
            } catch (e) {
                console.warn('Error closing writer:', e);
            }
            try {
                await this.writableStreamClosed;
            } catch (e) {
                console.warn('Error closing writable stream:', e);
            }
            this.writer = null;
        }

        if (this.port) {
            try {
                await this.port.close();
            } catch (e) {
                console.warn('Error closing port:', e);
            }
            this.port = null;
        }
        
        this.readBuffer = '';
        this.responseQueue = [];
    }

    // Continuous background reading
    async startReading() {
        this.isReading = true;
        
        try {
            while (this.isReading && this.reader) {
                const { value, done } = await this.reader.read();
                
                if (done) {
                    console.log('Reader closed');
                    break;
                }
                
                if (value) {
                    this.readBuffer += value;
                    this.processBuffer();
                }
            }
        } catch (error) {
            if (this.isReading) {
                console.error('Error in continuous reading:', error);
            }
        }
    }

    // Process buffer and extract complete lines
    processBuffer() {
        let newlineIndex;
        
        while ((newlineIndex = this.readBuffer.indexOf('\n')) !== -1) {
            const line = this.readBuffer.substring(0, newlineIndex).trim();
            this.readBuffer = this.readBuffer.substring(newlineIndex + 1);
            
            if (line.length > 0) {
                console.log('📥 Line received:', line);
                
                // Try to parse as JSON
                try {
                    const data = JSON.parse(line);
                    console.log('✅ Valid JSON detected:', data);
                    this.responseQueue.push(data);
                } catch (e) {
                    console.warn('⚠️ Non-JSON line (ESP32 debug):', line);
                    // Ignore non-JSON lines (ESP32 debug logs)
                }
            }
        }
        
        // Log queue status
        if (this.responseQueue.length > 0) {
            console.log('📊 Response queue:', this.responseQueue.length, 'pending');
        }
    }

    // Wait for a valid JSON response
    async waitForResponse(timeoutMs = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            if (this.responseQueue.length > 0) {
                return this.responseQueue.shift();
            }
            await this.delay(50);
        }
        
        throw new Error('Timeout waiting for ESP32 response');
    }

    async sendCommand(command: any) {
        if (!this.port) {
            throw new Error('Device not connected');
        }

        // Clear ONLY old responses before sending new command
        const beforeCount = this.responseQueue.length;
        if (beforeCount > 0) {
            console.warn(`⚠️ Clearing ${beforeCount} old response(s) from queue`);
            this.responseQueue = [];
        }

        // Send command
        const commandStr = JSON.stringify(command) + '\n';
        console.log('📤 Sending command:', commandStr.trim());
        
        try {
            await this.writer!.write(commandStr);
        } catch (error: any) {
            console.error('Error sending command:', error);
            throw new Error('Error sending command: ' + error.message);
        }

        // Small wait for ESP32 to process command
        await this.delay(100);

        // Wait for response with longer timeout for save
        const timeoutMs = command.action === 'save' ? 10000 : 5000;
        
        try {
            const response = await this.waitForResponse(timeoutMs);
            console.log('📥 Parsed response:', response);
            
            // Check if it's an error response from ESP32
            if (response.status === 'error') {
                throw new Error(response.message || 'Unknown ESP32 error');
            }
            
            return response;
        } catch (error) {
            console.error('Error waiting for response:', error);
            console.error('Current response queue:', this.responseQueue);
            console.error('Current buffer:', this.readBuffer);
            throw error;
        }
    }

    // Utility: delay
    delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async save(key: string, value: string) {
        return await this.sendCommand({
            action: 'save',
            key: key,
            value: value
        });
    }

    async read(key: string) {
        return await this.sendCommand({
            action: 'read',
            key: key
        });
    }

    async delete(key: string) {
        return await this.sendCommand({
            action: 'delete',
            key: key
        });
    }

    async list() {
        return await this.sendCommand({
            action: 'list'
        });
    }

    async clear() {
        return await this.sendCommand({
            action: 'clear'
        });
    }
}

export default ESP32WebUSBStorage;
