# Recorded basketball sound sources

All nine game samples in this directory are derived from authentic recordings shared under **CC0 1.0 Universal**. Commercial use, modification, and redistribution are permitted. Attribution is not required by CC0; source and author credits are retained here voluntarily.

License: https://creativecommons.org/publicdomain/zero/1.0/
Legal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode

Basketball sources retrieved on 2026-10-16; chain sources retrieved on 2026-10-17. The source page for each recording explicitly displayed “Creative Commons 0”. The retained source is the publicly served HQ MP3 preview, not a lossless original WAV. All final game files are mono, 32000 Hz, 16-bit PCM WAV.

| Game files | Recording | Author | Source page |
| --- | --- | --- | --- |
| chain1.wav, chain2.wav | Chain Rattling - 1 | Roxis_Boy | https://freesound.org/people/Roxis_Boy/sounds/401622/ |
| chain3.wav | metal_chain_pickup2 | funkysandwich | https://freesound.org/people/funkysandwich/sounds/871036/ |
| bounce1.wav | BasketballBounce.wav | Blankened | https://freesound.org/people/Blankened/sounds/505628/ |
| bounce2.wav | Basketball dribbling and shooting | OBXJohn | https://freesound.org/people/OBXJohn/sounds/262506/ |
| rim1.wav, rim2.wav | basketball.wav | reedhos | https://freesound.org/people/reedhos/sounds/244348/ |
| swish1.wav | Outdoor Basketball Shot.wav | fattirewhitey | https://freesound.org/people/fattirewhitey/sounds/381410/ |
| swish2.wav | Basketball Swish | vhschool2019 | https://freesound.org/people/vhschool2019/sounds/716930/ |

`provenance.json` records public download URLs, SHA-256 hashes of retained source previews and processed files, exact trim times, author credits, license identifiers, and processing for each clip. `originals/` retains the seven used source previews. `prepare_samples.py` reproduces the game WAVs from those originals using ffmpeg, numpy, and scipy.

Edits: trim to one event; downmix/resample; remove DC; gentle high/low-pass filtering; short edge fades; peak normalization to -0.92 dBFS; PCM16 encoding. The outdoor Zoom H4N net recording additionally uses a conservative stationary-noise reduction (maximum 9.1 dB attenuation) to lower ambient road noise. No synthetic sound is added to any asset in this directory. Runtime room acoustics, material layers, and positional processing are separate.

The source descriptions identify bounce1 as a single basketball bounce; bounce2 as dribbling in an open gym; rim1/rim2 as a basketball physically hitting a rim; swish1 as a nylon-net pass recorded with Zoom H4N in a driveway; and swish2 as a basketball swish recorded with an iPad. The five recordings were made independently, so timbre variations are deliberate. Native room sound remains at low levels in some clips. A single mono sample cannot reproduce every real-world microphone or hoop condition.

The three chain assets are **recordings of real metal chains**, not recordings of a basketball passing through a chain net. Chain1/chain2 retain irregular outdoor Zoom H6 chain rattles; chain3 captures a smaller metal chain with a Sony PCM recorder. Runtime contact energy controls their level and rate; gold-coated chain uses the same steel-chain source with a gently damped high end. There is no invented bell/coin tone and no synthesized resonant oscillator in the chain path. These recordings are trimmed and filtered, never substituted basketball-rim grains.
