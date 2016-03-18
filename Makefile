test:
	./node_modules/.bin/mocha --require tests/mocha-config tests/test.js

check-lint:
	./node_modules/.bin/eslint `git ls-files . | grep '[.]js$$'`

check: check-lint test

.PHONY: test check check-lint
