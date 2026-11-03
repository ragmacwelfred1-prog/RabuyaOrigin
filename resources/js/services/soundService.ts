// resources/js/services/soundService.ts

class SoundService {
    private audioContext: AudioContext | null = null;
    private audioElement: HTMLAudioElement | null = null;
    private isEnabled: boolean = true;
    private volume: number = 1.0;
    private useWebAudio: boolean = true;
    private soundBuffer: AudioBuffer | null = null;
    private isLoaded: boolean = false;
    private isLoading: boolean = false;

    constructor() {
        // Load sound preferences from localStorage
        this.isEnabled = localStorage.getItem('sound_enabled') !== 'false';
        this.volume = parseFloat(localStorage.getItem('sound_volume') || '1.0');
        this.useWebAudio = localStorage.getItem('use_web_audio') !== 'false';

        // ✅ DON'T preload on construction - lazy load only when needed
        console.log('🔊 Sound service initialized (lazy loading)');
    }

    /**
     * Preload the notification sound (only called when needed)
     */
    private async preloadSound(): Promise<void> {
        // Skip if already loaded or currently loading
        if (this.isLoaded || this.isLoading) {
            return;
        }

        this.isLoading = true;
        console.log('🔊 Loading notification sound...');

        try {
            if (this.useWebAudio) {
                await this.preloadWebAudioSound();
            } else {
                this.preloadHtml5Sound();
            }
            this.isLoaded = true;
        } catch (e) {
            console.warn('⚠️ Error loading sound:', e);
            // Generate fallback sound
            this.soundBuffer = this.generateFallbackSound();
            this.isLoaded = true;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Preload sound using Web Audio API
     */
    private async preloadWebAudioSound(): Promise<void> {
        const ctx = this.getAudioContext();
        if (!ctx) {
            console.warn(
                'Web Audio API not available, falling back to HTML5 Audio',
            );
            this.useWebAudio = false;
            this.preloadHtml5Sound();
            return;
        }

        try {
            // Try MP3 first, fallback to WAV
            let buffer = await this.loadSoundFile('/sounds/notification.mp3');
            if (!buffer) {
                buffer = await this.loadSoundFile('/sounds/notification.wav');
            }
            if (buffer) {
                this.soundBuffer = buffer;
                console.log('✅ Notification sound loaded (Web Audio)');
            } else {
                console.warn(
                    '⚠️ Failed to load notification sound, using generated sound',
                );
                this.soundBuffer = this.generateFallbackSound();
            }
        } catch (e) {
            console.warn('⚠️ Error loading sound:', e);
            this.soundBuffer = this.generateFallbackSound();
        }
    }

    /**
     * Load a sound file as AudioBuffer
     */
    private loadSoundFile(url: string): Promise<AudioBuffer | null> {
        return new Promise((resolve) => {
            const ctx = this.getAudioContext();
            if (!ctx) {
                resolve(null);
                return;
            }

            fetch(url)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return response.arrayBuffer();
                })
                .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
                .then((buffer) => resolve(buffer))
                .catch(() => resolve(null));
        });
    }

    /**
     * Generate a fallback notification sound using Web Audio API
     */
    private generateFallbackSound(): AudioBuffer | null {
        try {
            const ctx = this.getAudioContext();
            if (!ctx) return null;

            const sampleRate = ctx.sampleRate;
            const duration = 0.15;
            const sampleCount = sampleRate * duration;
            const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
            const data = buffer.getChannelData(0);

            // Create a pleasant notification sound (two quick tones)
            for (let i = 0; i < sampleCount; i++) {
                const t = i / sampleRate;
                const freq1 = 800;
                const freq2 = 1000;
                const envelope = Math.exp(-t * 20);
                const value =
                    (Math.sin(2 * Math.PI * freq1 * t) * 0.5 +
                        Math.sin(2 * Math.PI * freq2 * t) * 0.5) *
                    envelope;
                data[i] = value * 0.3;
            }

            return buffer;
        } catch (e) {
            return null;
        }
    }

    /**
     * Preload sound using HTML5 Audio
     */
    private preloadHtml5Sound(): void {
        try {
            this.audioElement = new Audio();
            this.audioElement.preload = 'auto';
            this.audioElement.src = '/sounds/notification.mp3';

            this.audioElement.addEventListener('error', () => {
                if (this.audioElement) {
                    this.audioElement.src = '/sounds/notification.wav';
                }
            });

            this.audioElement.addEventListener('canplaythrough', () => {
                console.log('✅ Notification sound loaded (HTML5 Audio)');
            });

            console.log('✅ HTML5 Audio sound preloaded');
        } catch (e) {
            console.warn('⚠️ Error loading HTML5 sound:', e);
        }
    }

    /**
     * Get AudioContext (lazy initialization)
     */
    private getAudioContext(): AudioContext | null {
        if (!this.audioContext) {
            try {
                this.audioContext = new (
                    window.AudioContext || (window as any).webkitAudioContext
                )();
            } catch (e) {
                console.warn('Web Audio API not supported:', e);
                return null;
            }
        }
        return this.audioContext;
    }

    /**
     * Play notification sound - lazy loads if needed
     */
    play(): void {
        if (!this.isEnabled) {
            console.log('🔊 Sound disabled');
            return;
        }

        // ✅ Lazy load sound only when first played
        if (!this.isLoaded) {
            this.preloadSound().then(() => {
                this.playSound();
            });
        } else {
            this.playSound();
        }
    }

    /**
     * Internal sound playback
     */
    private playSound(): void {
        console.log('🔊 Playing notification sound');

        if (this.useWebAudio) {
            this.playWebAudioSound();
        } else {
            this.playHtml5Sound();
        }
    }

    /**
     * Play sound using Web Audio API
     */
    private playWebAudioSound(): void {
        try {
            const ctx = this.getAudioContext();
            if (!ctx) {
                this.useWebAudio = false;
                this.playHtml5Sound();
                return;
            }

            // Resume context if suspended (Chrome autoplay policy)
            if (ctx.state === 'suspended') {
                ctx.resume()
                    .then(() => {
                        this.playWebAudioSoundInternal(ctx);
                    })
                    .catch((e) => {
                        console.warn('Failed to resume AudioContext:', e);
                    });
            } else {
                this.playWebAudioSoundInternal(ctx);
            }
        } catch (e) {
            console.warn('Failed to play sound:', e);
            this.playHtml5Sound();
        }
    }

    /**
     * Internal Web Audio playback
     */
    private playWebAudioSoundInternal(ctx: AudioContext): void {
        const buffer = this.soundBuffer || this.generateFallbackSound();
        if (!buffer) {
            console.warn('No sound buffer available');
            return;
        }

        try {
            const source = ctx.createBufferSource();
            source.buffer = buffer;

            const gainNode = ctx.createGain();
            gainNode.gain.value = this.volume;

            source.connect(gainNode);
            gainNode.connect(ctx.destination);

            source.start(0);
            source.onended = () => {
                source.disconnect();
                gainNode.disconnect();
            };
        } catch (e) {
            console.warn('Failed to play Web Audio sound:', e);
        }
    }

    /**
     * Play sound using HTML5 Audio
     */
    private playHtml5Sound(): void {
        try {
            if (!this.audioElement) {
                this.audioElement = new Audio();
                this.audioElement.src = '/sounds/notification.mp3';
                this.audioElement.addEventListener('error', () => {
                    if (this.audioElement) {
                        this.audioElement.src = '/sounds/notification.wav';
                    }
                });
            }

            this.audioElement.currentTime = 0;
            this.audioElement.volume = this.volume;
            this.audioElement.play().catch((e) => {
                console.warn('Failed to play HTML5 sound:', e);
            });
        } catch (e) {
            console.warn('Failed to play HTML5 sound:', e);
        }
    }

    /**
     * Enable/disable sound
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        localStorage.setItem('sound_enabled', String(enabled));
    }

    /**
     * Toggle sound
     */
    toggle(): void {
        this.setEnabled(!this.isEnabled);
    }

    /**
     * Check if sound is enabled
     */
    isSoundEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Set volume (0.0 - 1.0)
     */
    setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        localStorage.setItem('sound_volume', String(this.volume));
    }

    /**
     * Get current volume
     */
    getVolume(): number {
        return this.volume;
    }

    /**
     * Test sound - triggers lazy load
     */
    test(): void {
        this.play();
    }

    /**
     * Switch between Web Audio and HTML5 Audio
     */
    setAudioEngine(useWebAudio: boolean): void {
        this.useWebAudio = useWebAudio;
        localStorage.setItem('use_web_audio', String(useWebAudio));
        // Reset loaded state so it reloads with new engine
        this.isLoaded = false;
        this.soundBuffer = null;
        console.log(
            `🔊 Switched to ${useWebAudio ? 'Web Audio API' : 'HTML5 Audio'}`,
        );
    }

    /**
     * Get current audio engine
     */
    getAudioEngine(): string {
        return this.useWebAudio ? 'Web Audio API' : 'HTML5 Audio';
    }
}

// Export singleton instance
export const soundService = new SoundService();
export default soundService;
