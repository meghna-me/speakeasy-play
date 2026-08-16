# Speakeasy

A daily inductive-logic puzzle. A bartender has a hidden rule about what she
will serve; you order rounds and work it out from what she takes and what she
sends back.

**Play:** https://meghna-me.github.io/speakeasy-play/

Static site — vanilla JS, no build step, no dependencies, no network requests.
It opens straight from the filesystem.

This repository is the deployed site only. It is generated from the private
development repo, which holds the engine tests, the authoring gates and the
design record; do not edit these files here, they are overwritten on deploy.

Every rule lives in `rules.js` and is readable by anyone who opens it. That is
unavoidable for a static site and is an honour system, stated plainly rather
than pretended otherwise.
