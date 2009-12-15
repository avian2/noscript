#!/usr/bin/perl
use strict;
use LWP::Simple;
use RegExp::List;
use File::stat;
use File::Basename;

my $HTML5_URL = "http://mxr.mozilla.org/mozilla-central/source/parser/html/nsHtml5AtomList.h?raw=1";

my $SOURCE_FILE = dirname($0) . '/RequestWatchdog.js';

sub create_re
{
  my $cache = "/tmp/html5_events.re";
  my $sb = stat($cache);
  
  if ($sb && time() - $sb->mtime < 86400)
   {
    open IN, "<$cache";
    my @content = <IN>;
    close IN;
    return $content[0];
  }
  
	my $content =  get $HTML5_URL or die ("Couldn't fetch $HTML5_URL");
	$content =~ s/.*"(on\w+)".*/$1 /g;
	$content =~ s/HTML.*//g;
	$content =~ s/\s+/ /g;
	$content =~ s/^\s+|\s+$//g;
	my $l  = Regexp::List->new;
	my $re = $l->list2re(split(' ', $content));
	$re =~ s/\(\?-xism:(.*)\)/$1/;
  open (OUT, ">$cache");
  print OUT $re;
  close OUT;
  $re;
}

sub patch
{
  my $src = shift;
  my $dst = "$src.tmp";
  my $re = create_re();
  my $must_replace = 0;
  print "Patching $src...\n";
  open IN, "<$src" or die ("Can't open $src!");
  open OUT, ">$dst"  or die ("Can't open $dst!");
  
  while (<IN>)
  {
    my $line = $_;
    $must_replace = $line ne $_ if s/^(\s*const IC_EVENT_PATTERN\s*=\s*")([^"]+)/$1$re/;
    
    print OUT $_;
  }
  close IN;
  close OUT;
  
  if ($must_replace) {
    rename $dst, $src;
    print "Patched.\n";
  }
  else
  {
    unlink $dst;
    print "Nothing to do.\n";
  }
}

patch($SOURCE_FILE);
