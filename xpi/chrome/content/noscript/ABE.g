grammar ABE;

options {
   language=JavaScript;
   output=AST; 
}

tokens {
  T_ACTION;
  T_METHODS;
}

ruleset   : rule* EOF
;
rule      : subject predicate+ -> subject predicate+ 
;
predicate : action methods? origin? -> T_ACTION action T_METHODS methods? origin?
;
methods	  : (method+ | ALL)
;
method    : (HTTPVERB | SUB)
;
origin    : T_FROM resources 
;
subject   : T_SITE resources
;
resources : (resource+ | ALL)
;	
resource  : REGEXP | GLOB | URI | LOCATION
;
action    : A_DENY | A_LOGOUT | A_SANDBOX  | A_ACCEPT
;

T_SITE    : 'Site' ;
T_FROM 	  : ('f' | 'F') 'rom' ;
A_DENY    : 'Deny' ;
A_LOGOUT  : 'Logout' | 'Anon' 'ymize'? ;
A_SANDBOX : 'Sandbox' ;
A_ACCEPT  : 'Accept' ;

fragment URI_START : 'a'..'z' | '0'..'9'
;
fragment URI_PART  : 'a'..'z' | 'A'..'Z' | '0'..'9' | '_' | '-' | '.' | 
		     '[' | ']' | ':' | '/' | '@' | '~' | ';' | ',' | 
		     '?' | '&' | '=' | '%' | '#'
;
LOCATION  : 'LOCAL' | 'SELF'	
;
URI       : URI_START URI_PART+
;
GLOB      : (URI_START | '*') (URI_PART | '*')*
;
REGEXP    : '^' ~'\n'+
;
ALL	  : 'ALL'
;
SUB	  : 'SUB'	
;
HTTPVERB  : 'A'..'Z' 'A'..'Z'+
;	

WS  :  (' '|'\r'|'\t'|'\u000C'|'\n') {$channel=HIDDEN;}
;
COMMENT : '#' ~'\n'* {$channel=HIDDEN;}
;
