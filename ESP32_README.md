# ESP32 Hardware Storage Integration

## Description

The Neurai web wallet includes integration with ESP32 devices to securely store wallet material on external hardware. The device stores only the BIP39 entropy (hex) derived from your 12 or 24 recovery words. No passphrase is stored on the device.

## Requirements

### Hardware
- **ESP32** (any model: Classic, S2, S3, C3)
- **USB Cable** to connect the ESP32 to your computer
- The **ESP32 Serial Storage firmware** must be loaded on the ESP32

### Software
- **Browser**: Chrome, Edge or other Chromium-based browser (with Web Serial API)
- **Operating System**: Windows, macOS or Linux
- ⚠️ **NOT available on mobile** (Web Serial API is not available on Android/iOS)

## How to Use

### 1. Prepare the ESP32

1. Flash the `esp32_webusb_storage.ino` firmware to your ESP32
2. Connect the ESP32 to your computer via USB
3. Verify that the ESP32 LED is on

### 2. Connect from the Web Wallet

1. Open the Neurai web wallet
2. On the login page, find the **"🔌 ESP32 Hardware Storage"** section
3. Click **"📱 Connect ESP32"**
4. Select the ESP32 serial port in the browser dialog
   - On Windows: `COM3`, `COM4`, etc.
   - On macOS: `/dev/cu.usbserial-*`
   - On Linux: `/dev/ttyUSB0`, `/dev/ttyACM0`, etc.
5. If connection is successful, you'll see: **"ESP32 Connected"**

### 3. Save a Wallet

1. **Generate or enter** your recovery words (12 or 24 words)
2. (Optional) Enable and configure a **passphrase**
3. Click **"💾 Save to ESP32"**
4. Enter a **name** to identify this wallet (e.g., "wallet1", "main", "backup")
5. Enter a **PIN** (6-10 characters) to encrypt the wallet
   - This PIN will be required to decrypt the wallet later
   - ⚠️ **IMPORTANT**: Remember this PIN! If you lose it, you won't be able to recover your wallet from the ESP32
6. What is saved:
   - The wallet's BIP39 entropy as a hex string (derived from your 12 or 24 words)
   - The plaintext before encryption is only the entropy hex
   - The passphrase is NOT stored on the device
   - Everything is **encrypted with AES** using your PIN before storing on ESP32

### 4. Load a Wallet

1. Connect the ESP32 (if not already connected)
2. The system will show the list of saved wallets
3. Select a wallet from the **dropdown**
4. Click **"📖 Load"**
5. Enter the **PIN** you used when saving this wallet
6. If the PIN is correct, the words will be reconstructed from the stored entropy and placed into the field
7. Passphrase is not stored; if you use one, enter it manually in the passphrase field
8. If the PIN is incorrect, you'll see an error message

### 5. Delete a Wallet

1. Select the wallet you want to delete
2. Click **"🗑️ Delete"**
3. Confirm the deletion
4. **This CANNOT be undone** - make sure you have a backup

### 6. Refresh the List

If you added or deleted wallets and the list doesn't update:
- Click **"Refresh List"**

### 7. Disconnect

When finished:
- Click **"🔌 Disconnect ESP32"**

## Security

### Advantages
- **Physical storage**: Words are on hardware, not on your computer
- **PIN encryption**: Data is encrypted with AES-256 using your PIN before being stored
- **Multiple wallets**: You can save several wallets on a single ESP32
- **Persistent**: Data remains even if you disconnect the ESP32
- **Portable**: Carry your ESP32 with you like a "wallet keychain"
- **No clipboard copying**: When logging in with ESP32, the copy button is hidden to prevent accidental exposure

### Important Considerations

1. **Remember your PIN**
   - Each wallet is encrypted with its own PIN (6-10 characters)
   - If you lose the PIN, you CANNOT recover the wallet from the ESP32
   - Write down your PIN in a safe place, separate from the ESP32

2. **PIN provides encryption, not full security**
   - The encryption is as strong as your PIN
   - Use a strong, unique PIN for each important wallet
   - Avoid simple PINs like "123456" or repeated characters

3. **Physical access protection**
   - Even with encryption, store the ESP32 in a safe place
   - An attacker with the device could attempt to brute-force weak PINs

4. **Backup is essential**
   - The ESP32 can fail, get damaged or lost
   - The PIN could be forgotten
   - ALWAYS have a backup of your words in another safe place

5. **Not a professional hardware wallet**
   - This solution is for convenience, not for storing large amounts
   - For maximum security, use a commercial hardware wallet (Ledger, Trezor, etc.)

6. **Web Serial API required**
   - Only works in desktop browsers (Chrome, Edge)
   - Does not work on mobile devices

## Troubleshooting

### "Failed to decrypt: Invalid PIN"
- You entered the wrong PIN for this wallet
- Each wallet has its own PIN - make sure you're using the correct one
- PINs are case-sensitive and must match exactly
- If you've forgotten the PIN, you'll need to use your backup recovery words

### "Serial port doesn't appear"
- **Linux**: Add your user to the `dialout` group:
  ```bash
  sudo usermod -a -G dialout $USER
  ```
  Then log out and log back in.
- **Windows/macOS**: Make sure USB-Serial drivers are installed

### "Timeout waiting for ESP32 response"
- The ESP32 may not be responding correctly
- Disconnect and reconnect the ESP32
- Press the RESET button on the ESP32
- Verify that the firmware is correctly flashed

### "Connection error"
- Close other programs that might be using the serial port (Arduino IDE, PlatformIO, etc.)
- Try another USB port
- Verify that the USB cable is not charge-only (must transmit data)

### "Doesn't work in my browser"
- Verify you're using Chrome, Edge or another Chromium-based browser
- Firefox and Safari DO NOT support Web Serial API
- Does not work on mobile (Android/iOS)

## Storage Capacity

- **Available space**: ~1.5 MB in SPIFFS (varies by ESP32 model)
- **Number of wallets**: You can save hundreds of wallets
- **Practical limit**: Depends on the size of each entry (mnemonic + passphrase)

## Available Commands (Internal API)

The ESP32 accepts these JSON commands via Serial:

```json
// Save
{"action": "save", "key": "wallet1", "value": "word1 word2 ... word12"}

// Read
{"action": "read", "key": "wallet1"}

// List
{"action": "list"}

// Delete
{"action": "delete", "key": "wallet1"}

// Clear all
{"action": "clear"}
```

## Saved Data Format

### Storage on ESP32:
Data is stored **encrypted with AES-256** using your PIN. The encrypted string looks like random characters and cannot be read directly.

Example of encrypted data:
```
U2FsdGVkX1+vupppZksvRf5pq5g5XjFRlipRkwB0K1Y96Qsv2Lm+31cmzaAILwytX...
```

### Decrypted format (internal):

The decrypted plaintext is just the BIP39 entropy as a hex string:
```
6bd238e3b1f4a7f7b0d9f1a2c3d4e5f6... (128 or 256-bit entropy in hex)
```
From this entropy, the wallet reconstructs the 12 or 24 recovery words in the app. Passphrase, if used, is provided by the user at login time and is not stored.

## Encryption Details

- **Algorithm**: AES-256 (Advanced Encryption Standard)
- **Library**: CryptoJS (same used for local storage in the wallet)
- **Key derivation**: Your PIN is used directly as the encryption key
- **Process**:
   1. When saving: `BIP39 entropy (hex) → AES encrypt with PIN → Store encrypted data on ESP32`
   2. When loading: `Read encrypted data from ESP32 → AES decrypt with PIN → Entropy (hex) → Reconstruct mnemonic`
- **Security level**: The encryption strength depends on your PIN complexity

## References

- **Firmware documentation**: `flash_esp32/README.md`
- **Firmware code**: `flash_esp32/esp32_webusb_storage/esp32_webusb_storage.ino`
- **JavaScript library**: `src/ESP32Storage.ts`
- **Web Serial API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API

## License

This project is open source under the MIT license.

## Support

For issues or questions:
- Open an issue on the GitHub repository
- Visit: https://neurai.org

---

**Developed by:** Neurai Project
**Date:** October 2025
