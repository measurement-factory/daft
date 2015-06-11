test:
	mocha --compilers js:babel/register tests/*.js

check-lint:
	eslint `git ls-files . | grep '[.]js$$'`

check: check-lint test

.PHONY: test check check-lint
