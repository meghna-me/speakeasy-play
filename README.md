# Speakeasy

A daily inductive-logic puzzle. You are the bartender. A new customer sits down
each night with a usual they will not describe — a hidden rule about what they
will accept — and you work it out by pouring rounds and watching which ones they
take and which they send back.

**Play:** https://meghna-me.github.io/speakeasy-play/

Static site — vanilla JS, no build step, no dependencies, no network requests.
It opens straight from the filesystem.

This repository is the deployed site only. It is generated from the private
development repo, which holds the engine tests, the authoring gates and the
design record; do not edit these files here, they are overwritten on deploy.

`rules.js` is packed rather than plain text. That is deterrence against a casual
look — View Source no longer prints tonight's answer — and it is not protection:
the predicates run in your browser, so anyone determined can still read them.
Please play it straight.
