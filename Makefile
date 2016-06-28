BIN=./node_modules/.bin

test:
	$(BIN)/mocha --opts tests/mocha.opts tests/test.js

check-lint:
	$(BIN)/eslint `git ls-files . | grep '[.]js$$'`

check: check-lint test

.PHONY: test check check-lint
