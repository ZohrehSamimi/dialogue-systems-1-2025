

# Lab 3A – ASR Case Study Report

For this lab, I explored the limitations and behavior of automatic speech recognition (ASR) systems in the context of my final project: a Guess Proverb game that uses English proverbs. 

I tested some of my own proverbs, such as “Jack of all trades and master of none” and “Better safe than sorry,” using Azure's Speech-to-Text API. In some cases, the ASR system misheard or shortened the phrases, especially when I spoke quickly or casually. I also retrieved the confidence scores for each result using the Azure SDK. Most accurate phrases had confidence scores between 0.72 and 0.85, while misrecognized ones dropped below 0.6.

I noticed that idiomatic or uncommon phrases are especially vulnerable to transcription errors, and that my own accent could influence the results. To address how the proverbs would be spoken back to users in the game, I also created SSML scripts that add prosody, pauses, and emphasis to make the speech sound natural.

In conclusion, ASR systems work reasonably well for common, clearly spoken phrases but struggle with idioms, rare words, and accent variation. These limitations are important to consider when designing interactive dialogue systems based on speech input.
