BIN=./node_modules/.bin

test:
	$(BIN)/mocha --require tests/mocha-config tests/test.js

check-lint:
	$(BIN)/eslint `git ls-files . | grep '[.]js$$'`

check: check-lint test

.PHONY: test check check-lint
