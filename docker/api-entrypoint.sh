#!/bin/sh
set -e

node db/setup.js
exec node server/index.js
