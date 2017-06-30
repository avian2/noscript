#!/usr/bin/env python3
import argparse
import os
import re
from functools import partial

def escape(match):
	g = match.group(1)
	if g is None:
		return b'@VERSION@'
	else:
		return b'@X' + g + b'VERSION@'

def unescape(version, match):
	g = match.group(1)
	if g == b'':
		return version
	else:
		return b'@' + g[1:] + b'VERSION@'

def main():
	parser = argparse.ArgumentParser(description='version placeholder tool for noscript')
	parser.add_argument('--add', action='store_true', help='add version string')
	parser.add_argument('--strip', action='store_true', help='strip version string')
	parser.add_argument('version', nargs=1, help='version string to add or strip')
	parser.add_argument('path', nargs=1, help='path to xpi source')

	args = parser.parse_args()

	version = args.version[0].encode('ascii')
	path = args.path[0]

	if args.add and (not args.strip):
		patt = re.compile(b'@(X*)VERSION@')
		func = partial(unescape, version)
	elif args.strip and (not args.add):
		patt = re.compile(b'%s|@(X*)VERSION@' % (re.escape(version),))
		func = escape
	else:
		print('Either --add or --strip must be specified')
		return

	path_patt = re.compile(r'\.(?:dtd|xul|js)$')

	for root, dirs, files in os.walk(path):
		for name in files:
			if not path_patt.search(name):
				continue

			filepath = os.path.join(root, name)

			with open(filepath, 'rb') as f:
				data = f.read()

			ndata = patt.sub(func, data)
			if ndata != data:
				with open(filepath, 'wb') as f:
					f.write(ndata)

if __name__ == '__main__':
	main()
