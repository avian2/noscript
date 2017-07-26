// $ANTLR 3.1.1 ABE.g 2017-07-26 00:44:40

var ABELexer = function(input, state) {
// alternate constructor @todo
// public ABELexer(CharStream input)
// public ABELexer(CharStream input, RecognizerSharedState state) {
    if (!state) {
        state = new org.antlr.runtime.RecognizerSharedState();
    }

    (function(){
    }).call(this);

    this.dfa8 = new ABELexer.DFA8(this);
    this.dfa11 = new ABELexer.DFA11(this);
    ABELexer.superclass.constructor.call(this, input, state);


};

org.antlr.lang.augmentObject(ABELexer, {
    INC_TYPE: 11,
    T_FROM: 14,
    T__29: 29,
    GLOB: 17,
    HTTPVERB: 7,
    T__28: 28,
    A_LOGOUT: 21,
    A_DENY: 20,
    T_ACTION: 4,
    SUB: 8,
    T_METHODS: 5,
    EOF: -1,
    URI: 18,
    T__30: 30,
    INC: 9,
    WS: 26,
    LPAR: 10,
    COMMA: 12,
    URI_PART: 25,
    A_SANDBOX: 22,
    URI_START: 24,
    ALL: 6,
    A_ACCEPT: 23,
    REGEXP: 16,
    LOCATION: 19,
    RPAR: 13,
    T_SITE: 15,
    COMMENT: 27
});

(function(){
var HIDDEN = org.antlr.runtime.Token.HIDDEN_CHANNEL,
    EOF = org.antlr.runtime.Token.EOF;
org.antlr.lang.extend(ABELexer, org.antlr.runtime.Lexer, {
    INC_TYPE : 11,
    T_FROM : 14,
    T__29 : 29,
    GLOB : 17,
    HTTPVERB : 7,
    T__28 : 28,
    A_LOGOUT : 21,
    A_DENY : 20,
    T_ACTION : 4,
    SUB : 8,
    T_METHODS : 5,
    EOF : -1,
    URI : 18,
    T__30 : 30,
    INC : 9,
    WS : 26,
    LPAR : 10,
    COMMA : 12,
    URI_PART : 25,
    A_SANDBOX : 22,
    URI_START : 24,
    ALL : 6,
    A_ACCEPT : 23,
    REGEXP : 16,
    LOCATION : 19,
    RPAR : 13,
    T_SITE : 15,
    COMMENT : 27,
    getGrammarFileName: function() { return "ABE.g"; }
});
org.antlr.lang.augmentObject(ABELexer.prototype, {
    // $ANTLR start T__28
    mT__28: function()  {
        try {
            var _type = this.T__28;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:7:7: ( 'SELF' )
            // ABE.g:7:9: 'SELF'
            this.match("SELF"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "T__28",

    // $ANTLR start T__29
    mT__29: function()  {
        try {
            var _type = this.T__29;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:8:7: ( 'SELF+' )
            // ABE.g:8:9: 'SELF+'
            this.match("SELF+"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "T__29",

    // $ANTLR start T__30
    mT__30: function()  {
        try {
            var _type = this.T__30;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:9:7: ( 'SELF++' )
            // ABE.g:9:9: 'SELF++'
            this.match("SELF++"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "T__30",

    // $ANTLR start T_SITE
    mT_SITE: function()  {
        try {
            var _type = this.T_SITE;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:27:11: ( ( 'Site' | 'Request' ) )
            // ABE.g:27:13: ( 'Site' | 'Request' )
            // ABE.g:27:13: ( 'Site' | 'Request' )
            var alt1=2;
            var LA1_0 = this.input.LA(1);

            if ( (LA1_0=='S') ) {
                alt1=1;
            }
            else if ( (LA1_0=='R') ) {
                alt1=2;
            }
            else {
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 1, 0, this.input);

                throw nvae;
            }
            switch (alt1) {
                case 1 :
                    // ABE.g:27:14: 'Site'
                    this.match("Site"); 



                    break;
                case 2 :
                    // ABE.g:27:23: 'Request'
                    this.match("Request"); 



                    break;

            }




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "T_SITE",

    // $ANTLR start T_FROM
    mT_FROM: function()  {
        try {
            var _type = this.T_FROM;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:28:11: ( ( 'f' | 'F' ) 'rom' )
            // ABE.g:28:13: ( 'f' | 'F' ) 'rom'
            if ( this.input.LA(1)=='F'||this.input.LA(1)=='f' ) {
                this.input.consume();

            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                this.recover(mse);
                throw mse;}

            this.match("rom"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "T_FROM",

    // $ANTLR start A_DENY
    mA_DENY: function()  {
        try {
            var _type = this.A_DENY;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:29:11: ( 'Deny' )
            // ABE.g:29:13: 'Deny'
            this.match("Deny"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "A_DENY",

    // $ANTLR start A_LOGOUT
    mA_LOGOUT: function()  {
        try {
            var _type = this.A_LOGOUT;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:30:11: ( 'Logout' | 'Anon' ( 'ymize' )? )
            var alt3=2;
            var LA3_0 = this.input.LA(1);

            if ( (LA3_0=='L') ) {
                alt3=1;
            }
            else if ( (LA3_0=='A') ) {
                alt3=2;
            }
            else {
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 3, 0, this.input);

                throw nvae;
            }
            switch (alt3) {
                case 1 :
                    // ABE.g:30:13: 'Logout'
                    this.match("Logout"); 



                    break;
                case 2 :
                    // ABE.g:30:24: 'Anon' ( 'ymize' )?
                    this.match("Anon"); 

                    // ABE.g:30:31: ( 'ymize' )?
                    var alt2=2;
                    var LA2_0 = this.input.LA(1);

                    if ( (LA2_0=='y') ) {
                        alt2=1;
                    }
                    switch (alt2) {
                        case 1 :
                            // ABE.g:30:31: 'ymize'
                            this.match("ymize"); 



                            break;

                    }



                    break;

            }
            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "A_LOGOUT",

    // $ANTLR start A_SANDBOX
    mA_SANDBOX: function()  {
        try {
            var _type = this.A_SANDBOX;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:31:11: ( 'Sandbox' )
            // ABE.g:31:13: 'Sandbox'
            this.match("Sandbox"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "A_SANDBOX",

    // $ANTLR start A_ACCEPT
    mA_ACCEPT: function()  {
        try {
            var _type = this.A_ACCEPT;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:32:11: ( 'Accept' )
            // ABE.g:32:13: 'Accept'
            this.match("Accept"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "A_ACCEPT",

    // $ANTLR start URI_START
    mURI_START: function()  {
        try {
            // ABE.g:34:20: ( 'a' .. 'z' | '0' .. '9' )
            // ABE.g:
            if ( (this.input.LA(1)>='0' && this.input.LA(1)<='9')||(this.input.LA(1)>='a' && this.input.LA(1)<='z') ) {
                this.input.consume();

            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                this.recover(mse);
                throw mse;}




        }
        finally {
        }
    },
    // $ANTLR end "URI_START",

    // $ANTLR start URI_PART
    mURI_PART: function()  {
        try {
            // ABE.g:35:20: ( 'a' .. 'z' | 'A' .. 'Z' | '0' .. '9' | '_' | '-' | '.' | '[' | ']' | ':' | '/' | '@' | '~' | ';' | ',' | '?' | '&' | '=' | '%' | '#' )
            // ABE.g:
            if ( this.input.LA(1)=='#'||(this.input.LA(1)>='%' && this.input.LA(1)<='&')||(this.input.LA(1)>=',' && this.input.LA(1)<=';')||this.input.LA(1)=='='||(this.input.LA(1)>='?' && this.input.LA(1)<='[')||this.input.LA(1)==']'||this.input.LA(1)=='_'||(this.input.LA(1)>='a' && this.input.LA(1)<='z')||this.input.LA(1)=='~' ) {
                this.input.consume();

            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                this.recover(mse);
                throw mse;}




        }
        finally {
        }
    },
    // $ANTLR end "URI_PART",

    // $ANTLR start LOCATION
    mLOCATION: function()  {
        try {
            var _type = this.LOCATION;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:38:11: ( 'LOCAL' )
            // ABE.g:38:13: 'LOCAL'
            this.match("LOCAL"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "LOCATION",

    // $ANTLR start URI
    mURI: function()  {
        try {
            var _type = this.URI;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:39:11: ( URI_START ( URI_PART )+ )
            // ABE.g:39:13: URI_START ( URI_PART )+
            this.mURI_START(); 
            // ABE.g:39:23: ( URI_PART )+
            var cnt4=0;
            loop4:
            do {
                var alt4=2;
                var LA4_0 = this.input.LA(1);

                if ( (LA4_0=='#'||(LA4_0>='%' && LA4_0<='&')||(LA4_0>=',' && LA4_0<=';')||LA4_0=='='||(LA4_0>='?' && LA4_0<='[')||LA4_0==']'||LA4_0=='_'||(LA4_0>='a' && LA4_0<='z')||LA4_0=='~') ) {
                    alt4=1;
                }


                switch (alt4) {
                case 1 :
                    // ABE.g:39:23: URI_PART
                    this.mURI_PART(); 


                    break;

                default :
                    if ( cnt4 >= 1 ) {
                        break loop4;
                    }
                        var eee = new org.antlr.runtime.EarlyExitException(4, this.input);
                        throw eee;
                }
                cnt4++;
            } while (true);




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "URI",

    // $ANTLR start GLOB
    mGLOB: function()  {
        try {
            var _type = this.GLOB;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:40:11: ( ( URI_START | '*' | '.' ) ( URI_PART | '*' )* )
            // ABE.g:40:13: ( URI_START | '*' | '.' ) ( URI_PART | '*' )*
            if ( this.input.LA(1)=='*'||this.input.LA(1)=='.'||(this.input.LA(1)>='0' && this.input.LA(1)<='9')||(this.input.LA(1)>='a' && this.input.LA(1)<='z') ) {
                this.input.consume();

            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                this.recover(mse);
                throw mse;}

            // ABE.g:40:37: ( URI_PART | '*' )*
            loop5:
            do {
                var alt5=2;
                var LA5_0 = this.input.LA(1);

                if ( (LA5_0=='#'||(LA5_0>='%' && LA5_0<='&')||LA5_0=='*'||(LA5_0>=',' && LA5_0<=';')||LA5_0=='='||(LA5_0>='?' && LA5_0<='[')||LA5_0==']'||LA5_0=='_'||(LA5_0>='a' && LA5_0<='z')||LA5_0=='~') ) {
                    alt5=1;
                }


                switch (alt5) {
                case 1 :
                    // ABE.g:
                    if ( this.input.LA(1)=='#'||(this.input.LA(1)>='%' && this.input.LA(1)<='&')||this.input.LA(1)=='*'||(this.input.LA(1)>=',' && this.input.LA(1)<=';')||this.input.LA(1)=='='||(this.input.LA(1)>='?' && this.input.LA(1)<='[')||this.input.LA(1)==']'||this.input.LA(1)=='_'||(this.input.LA(1)>='a' && this.input.LA(1)<='z')||this.input.LA(1)=='~' ) {
                        this.input.consume();

                    }
                    else {
                        var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                        this.recover(mse);
                        throw mse;}



                    break;

                default :
                    break loop5;
                }
            } while (true);




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "GLOB",

    // $ANTLR start REGEXP
    mREGEXP: function()  {
        try {
            var _type = this.REGEXP;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:41:11: ( '^' (~ '\\n' )+ )
            // ABE.g:41:13: '^' (~ '\\n' )+
            this.match('^'); 
            // ABE.g:41:17: (~ '\\n' )+
            var cnt6=0;
            loop6:
            do {
                var alt6=2;
                var LA6_0 = this.input.LA(1);

                if ( ((LA6_0>='\u0000' && LA6_0<='\t')||(LA6_0>='\u000B' && LA6_0<='\uFFFF')) ) {
                    alt6=1;
                }


                switch (alt6) {
                case 1 :
                    // ABE.g:41:17: ~ '\\n'
                    if ( (this.input.LA(1)>='\u0000' && this.input.LA(1)<='\t')||(this.input.LA(1)>='\u000B' && this.input.LA(1)<='\uFFFF') ) {
                        this.input.consume();

                    }
                    else {
                        var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                        this.recover(mse);
                        throw mse;}



                    break;

                default :
                    if ( cnt6 >= 1 ) {
                        break loop6;
                    }
                        var eee = new org.antlr.runtime.EarlyExitException(6, this.input);
                        throw eee;
                }
                cnt6++;
            } while (true);




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "REGEXP",

    // $ANTLR start ALL
    mALL: function()  {
        try {
            var _type = this.ALL;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:43:11: ( 'ALL' )
            // ABE.g:43:13: 'ALL'
            this.match("ALL"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "ALL",

    // $ANTLR start SUB
    mSUB: function()  {
        try {
            var _type = this.SUB;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:44:11: ( 'SUB' )
            // ABE.g:44:13: 'SUB'
            this.match("SUB"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "SUB",

    // $ANTLR start INC
    mINC: function()  {
        try {
            var _type = this.INC;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:45:11: ( 'INC' ( 'LUSION' )? )
            // ABE.g:45:13: 'INC' ( 'LUSION' )?
            this.match("INC"); 

            // ABE.g:45:19: ( 'LUSION' )?
            var alt7=2;
            var LA7_0 = this.input.LA(1);

            if ( (LA7_0=='L') ) {
                alt7=1;
            }
            switch (alt7) {
                case 1 :
                    // ABE.g:45:19: 'LUSION'
                    this.match("LUSION"); 



                    break;

            }




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "INC",

    // $ANTLR start HTTPVERB
    mHTTPVERB: function()  {
        try {
            var _type = this.HTTPVERB;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:46:11: ( 'GET' | 'POST' | 'PUT' | 'HEAD' | 'PATCH' | 'DELETE' | 'TRACE' | 'OPTIONS' )
            var alt8=8;
            alt8 = this.dfa8.predict(this.input);
            switch (alt8) {
                case 1 :
                    // ABE.g:46:13: 'GET'
                    this.match("GET"); 



                    break;
                case 2 :
                    // ABE.g:46:21: 'POST'
                    this.match("POST"); 



                    break;
                case 3 :
                    // ABE.g:46:30: 'PUT'
                    this.match("PUT"); 



                    break;
                case 4 :
                    // ABE.g:46:38: 'HEAD'
                    this.match("HEAD"); 



                    break;
                case 5 :
                    // ABE.g:46:47: 'PATCH'
                    this.match("PATCH"); 



                    break;
                case 6 :
                    // ABE.g:46:57: 'DELETE'
                    this.match("DELETE"); 



                    break;
                case 7 :
                    // ABE.g:46:68: 'TRACE'
                    this.match("TRACE"); 



                    break;
                case 8 :
                    // ABE.g:46:78: 'OPTIONS'
                    this.match("OPTIONS"); 



                    break;

            }
            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "HTTPVERB",

    // $ANTLR start INC_TYPE
    mINC_TYPE: function()  {
        try {
            var _type = this.INC_TYPE;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:47:11: ( 'A' .. 'Z' ( 'A' .. 'Z' | 'A' .. 'Z' '_' 'A' .. 'Z' )+ )
            // ABE.g:47:13: 'A' .. 'Z' ( 'A' .. 'Z' | 'A' .. 'Z' '_' 'A' .. 'Z' )+
            this.matchRange('A','Z'); 
            // ABE.g:47:22: ( 'A' .. 'Z' | 'A' .. 'Z' '_' 'A' .. 'Z' )+
            var cnt9=0;
            loop9:
            do {
                var alt9=3;
                var LA9_0 = this.input.LA(1);

                if ( ((LA9_0>='A' && LA9_0<='Z')) ) {
                    var LA9_2 = this.input.LA(2);

                    if ( (LA9_2=='_') ) {
                        alt9=2;
                    }

                    else {
                        alt9=1;
                    }

                }


                switch (alt9) {
                case 1 :
                    // ABE.g:47:23: 'A' .. 'Z'
                    this.matchRange('A','Z'); 


                    break;
                case 2 :
                    // ABE.g:47:34: 'A' .. 'Z' '_' 'A' .. 'Z'
                    this.matchRange('A','Z'); 
                    this.match('_'); 
                    this.matchRange('A','Z'); 


                    break;

                default :
                    if ( cnt9 >= 1 ) {
                        break loop9;
                    }
                        var eee = new org.antlr.runtime.EarlyExitException(9, this.input);
                        throw eee;
                }
                cnt9++;
            } while (true);




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "INC_TYPE",

    // $ANTLR start COMMA
    mCOMMA: function()  {
        try {
            var _type = this.COMMA;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:50:11: ( ',' )
            // ABE.g:50:13: ','
            this.match(','); 



            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "COMMA",

    // $ANTLR start LPAR
    mLPAR: function()  {
        try {
            var _type = this.LPAR;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:51:11: ( '(' )
            // ABE.g:51:13: '('
            this.match('('); 



            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "LPAR",

    // $ANTLR start RPAR
    mRPAR: function()  {
        try {
            var _type = this.RPAR;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:52:11: ( ')' )
            // ABE.g:52:13: ')'
            this.match(')'); 



            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "RPAR",

    // $ANTLR start WS
    mWS: function()  {
        try {
            var _type = this.WS;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:54:11: ( ( ' ' | '\\r' | '\\t' | '\\u000C' | '\\n' ) )
            // ABE.g:54:14: ( ' ' | '\\r' | '\\t' | '\\u000C' | '\\n' )
            if ( (this.input.LA(1)>='\t' && this.input.LA(1)<='\n')||(this.input.LA(1)>='\f' && this.input.LA(1)<='\r')||this.input.LA(1)==' ' ) {
                this.input.consume();

            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                this.recover(mse);
                throw mse;}

            _channel=HIDDEN;



            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "WS",

    // $ANTLR start COMMENT
    mCOMMENT: function()  {
        try {
            var _type = this.COMMENT;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:55:9: ( '#' (~ '\\n' )* )
            // ABE.g:55:11: '#' (~ '\\n' )*
            this.match('#'); 
            // ABE.g:55:15: (~ '\\n' )*
            loop10:
            do {
                var alt10=2;
                var LA10_0 = this.input.LA(1);

                if ( ((LA10_0>='\u0000' && LA10_0<='\t')||(LA10_0>='\u000B' && LA10_0<='\uFFFF')) ) {
                    alt10=1;
                }


                switch (alt10) {
                case 1 :
                    // ABE.g:55:15: ~ '\\n'
                    if ( (this.input.LA(1)>='\u0000' && this.input.LA(1)<='\t')||(this.input.LA(1)>='\u000B' && this.input.LA(1)<='\uFFFF') ) {
                        this.input.consume();

                    }
                    else {
                        var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                        this.recover(mse);
                        throw mse;}



                    break;

                default :
                    break loop10;
                }
            } while (true);

            _channel=HIDDEN;



            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "COMMENT",

    mTokens: function() {
        // ABE.g:1:8: ( T__28 | T__29 | T__30 | T_SITE | T_FROM | A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT | LOCATION | URI | GLOB | REGEXP | ALL | SUB | INC | HTTPVERB | INC_TYPE | COMMA | LPAR | RPAR | WS | COMMENT )
        var alt11=23;
        alt11 = this.dfa11.predict(this.input);
        switch (alt11) {
            case 1 :
                // ABE.g:1:10: T__28
                this.mT__28(); 


                break;
            case 2 :
                // ABE.g:1:16: T__29
                this.mT__29(); 


                break;
            case 3 :
                // ABE.g:1:22: T__30
                this.mT__30(); 


                break;
            case 4 :
                // ABE.g:1:28: T_SITE
                this.mT_SITE(); 


                break;
            case 5 :
                // ABE.g:1:35: T_FROM
                this.mT_FROM(); 


                break;
            case 6 :
                // ABE.g:1:42: A_DENY
                this.mA_DENY(); 


                break;
            case 7 :
                // ABE.g:1:49: A_LOGOUT
                this.mA_LOGOUT(); 


                break;
            case 8 :
                // ABE.g:1:58: A_SANDBOX
                this.mA_SANDBOX(); 


                break;
            case 9 :
                // ABE.g:1:68: A_ACCEPT
                this.mA_ACCEPT(); 


                break;
            case 10 :
                // ABE.g:1:77: LOCATION
                this.mLOCATION(); 


                break;
            case 11 :
                // ABE.g:1:86: URI
                this.mURI(); 


                break;
            case 12 :
                // ABE.g:1:90: GLOB
                this.mGLOB(); 


                break;
            case 13 :
                // ABE.g:1:95: REGEXP
                this.mREGEXP(); 


                break;
            case 14 :
                // ABE.g:1:102: ALL
                this.mALL(); 


                break;
            case 15 :
                // ABE.g:1:106: SUB
                this.mSUB(); 


                break;
            case 16 :
                // ABE.g:1:110: INC
                this.mINC(); 


                break;
            case 17 :
                // ABE.g:1:114: HTTPVERB
                this.mHTTPVERB(); 


                break;
            case 18 :
                // ABE.g:1:123: INC_TYPE
                this.mINC_TYPE(); 


                break;
            case 19 :
                // ABE.g:1:132: COMMA
                this.mCOMMA(); 


                break;
            case 20 :
                // ABE.g:1:138: LPAR
                this.mLPAR(); 


                break;
            case 21 :
                // ABE.g:1:143: RPAR
                this.mRPAR(); 


                break;
            case 22 :
                // ABE.g:1:148: WS
                this.mWS(); 


                break;
            case 23 :
                // ABE.g:1:151: COMMENT
                this.mCOMMENT(); 


                break;

        }

    }

}, true); // important to pass true to overwrite default implementations

org.antlr.lang.augmentObject(ABELexer, {
    DFA8_eotS:
        "\u000a\uffff",
    DFA8_eofS:
        "\u000a\uffff",
    DFA8_minS:
        "\u0001\u0044\u0001\uffff\u0001\u0041\u0007\uffff",
    DFA8_maxS:
        "\u0001\u0054\u0001\uffff\u0001\u0055\u0007\uffff",
    DFA8_acceptS:
        "\u0001\uffff\u0001\u0001\u0001\uffff\u0001\u0004\u0001\u0006\u0001"+
    "\u0007\u0001\u0008\u0001\u0002\u0001\u0003\u0001\u0005",
    DFA8_specialS:
        "\u000a\uffff}>",
    DFA8_transitionS: [
            "\u0001\u0004\u0002\uffff\u0001\u0001\u0001\u0003\u0006\uffff"+
            "\u0001\u0006\u0001\u0002\u0003\uffff\u0001\u0005",
            "",
            "\u0001\u0009\u000d\uffff\u0001\u0007\u0005\uffff\u0001\u0008",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
    ]
});

org.antlr.lang.augmentObject(ABELexer, {
    DFA8_eot:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA8_eotS),
    DFA8_eof:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA8_eofS),
    DFA8_min:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA8_minS),
    DFA8_max:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA8_maxS),
    DFA8_accept:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA8_acceptS),
    DFA8_special:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA8_specialS),
    DFA8_transition: (function() {
        var a = [],
            i,
            numStates = ABELexer.DFA8_transitionS.length;
        for (i=0; i<numStates; i++) {
            a.push(org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA8_transitionS[i]));
        }
        return a;
    })()
});

ABELexer.DFA8 = function(recognizer) {
    this.recognizer = recognizer;
    this.decisionNumber = 8;
    this.eot = ABELexer.DFA8_eot;
    this.eof = ABELexer.DFA8_eof;
    this.min = ABELexer.DFA8_min;
    this.max = ABELexer.DFA8_max;
    this.accept = ABELexer.DFA8_accept;
    this.special = ABELexer.DFA8_special;
    this.transition = ABELexer.DFA8_transition;
};

org.antlr.lang.extend(ABELexer.DFA8, org.antlr.runtime.DFA, {
    getDescription: function() {
        return "46:1: HTTPVERB : ( 'GET' | 'POST' | 'PUT' | 'HEAD' | 'PATCH' | 'DELETE' | 'TRACE' | 'OPTIONS' );";
    },
    dummy: null
});
org.antlr.lang.augmentObject(ABELexer, {
    DFA11_eotS:
        "\u0003\uffff\u0001\u0009\u0004\uffff\u0001\u0009\u000e\uffff\u0001"+
    "\u0011\u0002\uffff\u0001\u0011\u0002\u002f\u0001\uffff\u0001\u0011\u0001"+
    "\uffff\u0001\u0011\u0001\uffff\u0001\u0011\u0001\uffff\u0009\u0011\u0001"+
    "\u003c\u0001\u002f\u0001\uffff\u0002\u0011\u0001\u0040\u0001\u0041\u0001"+
    "\u0043\u0001\u0011\u0001\u0043\u0004\u0011\u0001\u004a\u0001\uffff\u0001"+
    "\u0023\u0002\u0011\u0002\uffff\u0001\u0011\u0001\uffff\u0001\u0043\u0001"+
    "\u0011\u0001\u0043\u0002\u0011\u0001\u0052\u0001\uffff\u0001\u0011\u0001"+
    "\u0054\u0001\u0011\u0002\u0043\u0001\u0011\u0002\uffff\u0001\u0043\u0001"+
    "\uffff\u0003\u0011\u0001\u0043\u0001\u0011\u0001\u0041",
    DFA11_eofS:
        "\u005b\uffff",
    DFA11_minS:
        "\u0001\u0009\u0002\u0041\u0001\u0023\u0004\u0041\u0001\u0023\u0002"+
    "\uffff\u0006\u0041\u0006\uffff\u0001\u004c\u0002\uffff\u0001\u0042\u0002"+
    "\u0023\u0001\uffff\u0001\u004c\u0001\uffff\u0001\u0043\u0001\uffff\u0001"+
    "\u004c\u0001\uffff\u0001\u0043\u0001\u0054\u0001\u0053\u0002\u0054\u0002"+
    "\u0041\u0001\u0054\u0001\u0046\u0001\u0041\u0001\u0023\u0001\uffff\u0001"+
    "\u0045\u0004\u0041\u0001\u0054\u0001\u0041\u0001\u0043\u0001\u0044\u0001"+
    "\u0043\u0001\u0049\u0001\u002b\u0001\uffff\u0001\u0023\u0001\u0054\u0001"+
    "\u004c\u0002\uffff\u0001\u0055\u0001\uffff\u0001\u0041\u0001\u0048\u0001"+
    "\u0041\u0001\u0045\u0001\u004f\u0001\u002b\u0001\uffff\u0001\u0045\u0001"+
    "\u0041\u0001\u0053\u0002\u0041\u0001\u004e\u0002\uffff\u0001\u0041\u0001"+
    "\uffff\u0001\u0049\u0001\u0053\u0001\u004f\u0001\u0041\u0001\u004e\u0001"+
    "\u0041",
    DFA11_maxS:
        "\u0001\u007a\u0001\u0069\u0001\u0065\u0001\u007e\u0001\u0065\u0001"+
    "\u006f\u0001\u006e\u0001\u0072\u0001\u007e\u0002\uffff\u0006\u005a\u0006"+
    "\uffff\u0001\u004c\u0002\uffff\u0001\u0042\u0002\u007e\u0001\uffff\u0001"+
    "\u004c\u0001\uffff\u0001\u0043\u0001\uffff\u0001\u004c\u0001\uffff\u0001"+
    "\u0043\u0001\u0054\u0001\u0053\u0002\u0054\u0002\u0041\u0001\u0054\u0001"+
    "\u0046\u0001\u005f\u0001\u007e\u0001\uffff\u0001\u0045\u0001\u0041\u0003"+
    "\u005f\u0001\u0054\u0001\u005f\u0001\u0043\u0001\u0044\u0001\u0043\u0001"+
    "\u0049\u0001\u005f\u0001\uffff\u0001\u007e\u0001\u0054\u0001\u004c\u0002"+
    "\uffff\u0001\u0055\u0001\uffff\u0001\u005f\u0001\u0048\u0001\u005f\u0001"+
    "\u0045\u0001\u004f\u0001\u002b\u0001\uffff\u0001\u0045\u0001\u005f\u0001"+
    "\u0053\u0002\u005f\u0001\u004e\u0002\uffff\u0001\u005f\u0001\uffff\u0001"+
    "\u0049\u0001\u0053\u0001\u004f\u0001\u005f\u0001\u004e\u0001\u005f",
    DFA11_acceptS:
        "\u0009\uffff\u0001\u000c\u0001\u000d\u0006\uffff\u0001\u0012\u0001"+
    "\u0013\u0001\u0014\u0001\u0015\u0001\u0016\u0001\u0017\u0001\uffff\u0001"+
    "\u0004\u0001\u0008\u0003\uffff\u0001\u0006\u0001\uffff\u0001\u0007\u0001"+
    "\uffff\u0001\u0009\u0001\uffff\u0001\u0005\u000b\uffff\u0001\u000b\u000c"+
    "\uffff\u0001\u000f\u0003\uffff\u0001\u000e\u0001\u0010\u0001\uffff\u0001"+
    "\u0011\u0006\uffff\u0001\u0001\u0006\uffff\u0001\u0003\u0001\u0002\u0001"+
    "\uffff\u0001\u000a\u0006\uffff",
    DFA11_specialS:
        "\u005b\uffff}>",
    DFA11_transitionS: [
            "\u0002\u0015\u0001\uffff\u0002\u0015\u0012\uffff\u0001\u0015"+
            "\u0002\uffff\u0001\u0016\u0004\uffff\u0001\u0013\u0001\u0014"+
            "\u0001\u0009\u0001\uffff\u0001\u0012\u0001\uffff\u0001\u0009"+
            "\u0001\uffff\u000a\u0008\u0007\uffff\u0001\u0006\u0002\u0011"+
            "\u0001\u0004\u0001\u0011\u0001\u0007\u0001\u000c\u0001\u000e"+
            "\u0001\u000b\u0002\u0011\u0001\u0005\u0002\u0011\u0001\u0010"+
            "\u0001\u000d\u0001\u0011\u0001\u0002\u0001\u0001\u0001\u000f"+
            "\u0006\u0011\u0003\uffff\u0001\u000a\u0002\uffff\u0005\u0008"+
            "\u0001\u0003\u0014\u0008",
            "\u0004\u0011\u0001\u0017\u000f\u0011\u0001\u001a\u0005\u0011"+
            "\u0006\uffff\u0001\u0019\u0007\uffff\u0001\u0018",
            "\u001a\u0011\u000a\uffff\u0001\u0018",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0005\uffff\u0010\u001c"+
            "\u0001\uffff\u0001\u001c\u0001\uffff\u001d\u001c\u0001\uffff"+
            "\u0001\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0011\u001c"+
            "\u0001\u001b\u0008\u001c\u0003\uffff\u0001\u001c",
            "\u0004\u0011\u0001\u001e\u0015\u0011\u000a\uffff\u0001\u001d",
            "\u000e\u0011\u0001\u0020\u000b\u0011\u0014\uffff\u0001\u001f",
            "\u000b\u0011\u0001\u0022\u000e\u0011\u0008\uffff\u0001\u0021"+
            "\u000a\uffff\u0001\u001f",
            "\u001a\u0011\u0017\uffff\u0001\u0023",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0005\uffff\u0010\u001c"+
            "\u0001\uffff\u0001\u001c\u0001\uffff\u001d\u001c\u0001\uffff"+
            "\u0001\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u001a\u001c"+
            "\u0003\uffff\u0001\u001c",
            "",
            "",
            "\u000d\u0011\u0001\u0024\u000c\u0011",
            "\u0004\u0011\u0001\u0025\u0015\u0011",
            "\u0001\u0028\u000d\u0011\u0001\u0026\u0005\u0011\u0001\u0027"+
            "\u0005\u0011",
            "\u0004\u0011\u0001\u0029\u0015\u0011",
            "\u0011\u0011\u0001\u002a\u0008\u0011",
            "\u000f\u0011\u0001\u002b\u000a\u0011",
            "",
            "",
            "",
            "",
            "",
            "",
            "\u0001\u002c",
            "",
            "",
            "\u0001\u002d",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0003\uffff\u0001\u0009"+
            "\u0001\uffff\u0010\u001c\u0001\uffff\u0001\u001c\u0001\uffff"+
            "\u001d\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0001\u001c"+
            "\u0001\uffff\u000e\u001c\u0001\u002e\u000b\u001c\u0003\uffff"+
            "\u0001\u001c",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0003\uffff\u0001\u0009"+
            "\u0001\uffff\u0010\u001c\u0001\uffff\u0001\u001c\u0001\uffff"+
            "\u001d\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0001\u001c"+
            "\u0001\uffff\u001a\u001c\u0003\uffff\u0001\u001c",
            "",
            "\u0001\u0030",
            "",
            "\u0001\u0031",
            "",
            "\u0001\u0032",
            "",
            "\u0001\u0033",
            "\u0001\u0034",
            "\u0001\u0035",
            "\u0001\u0036",
            "\u0001\u0037",
            "\u0001\u0038",
            "\u0001\u0039",
            "\u0001\u003a",
            "\u0001\u003b",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0003\uffff\u0001\u0009"+
            "\u0001\uffff\u0010\u001c\u0001\uffff\u0001\u001c\u0001\uffff"+
            "\u001d\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0001\u001c"+
            "\u0001\uffff\u000c\u001c\u0001\u003d\u000d\u001c\u0003\uffff"+
            "\u0001\u001c",
            "",
            "\u0001\u003e",
            "\u0001\u003f",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u000b\u0011\u0001\u0042\u000e\u0011\u0004\uffff\u0001\u0011",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u0001\u0044",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u0001\u0045",
            "\u0001\u0046",
            "\u0001\u0047",
            "\u0001\u0048",
            "\u0001\u0049\u0015\uffff\u001a\u0011\u0004\uffff\u0001\u0011",
            "",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0003\uffff\u0001\u0009"+
            "\u0001\uffff\u0010\u001c\u0001\uffff\u0001\u001c\u0001\uffff"+
            "\u001d\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0001\u001c"+
            "\u0001\uffff\u001a\u001c\u0003\uffff\u0001\u001c",
            "\u0001\u004b",
            "\u0001\u004c",
            "",
            "",
            "\u0001\u004d",
            "",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u0001\u004e",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u0001\u004f",
            "\u0001\u0050",
            "\u0001\u0051",
            "",
            "\u0001\u0053",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u0001\u0055",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u0001\u0056",
            "",
            "",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "",
            "\u0001\u0057",
            "\u0001\u0058",
            "\u0001\u0059",
            "\u001a\u0011\u0004\uffff\u0001\u0011",
            "\u0001\u005a",
            "\u001a\u0011\u0004\uffff\u0001\u0011"
    ]
});

org.antlr.lang.augmentObject(ABELexer, {
    DFA11_eot:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA11_eotS),
    DFA11_eof:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA11_eofS),
    DFA11_min:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA11_minS),
    DFA11_max:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA11_maxS),
    DFA11_accept:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA11_acceptS),
    DFA11_special:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA11_specialS),
    DFA11_transition: (function() {
        var a = [],
            i,
            numStates = ABELexer.DFA11_transitionS.length;
        for (i=0; i<numStates; i++) {
            a.push(org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA11_transitionS[i]));
        }
        return a;
    })()
});

ABELexer.DFA11 = function(recognizer) {
    this.recognizer = recognizer;
    this.decisionNumber = 11;
    this.eot = ABELexer.DFA11_eot;
    this.eof = ABELexer.DFA11_eof;
    this.min = ABELexer.DFA11_min;
    this.max = ABELexer.DFA11_max;
    this.accept = ABELexer.DFA11_accept;
    this.special = ABELexer.DFA11_special;
    this.transition = ABELexer.DFA11_transition;
};

org.antlr.lang.extend(ABELexer.DFA11, org.antlr.runtime.DFA, {
    getDescription: function() {
        return "1:1: Tokens : ( T__28 | T__29 | T__30 | T_SITE | T_FROM | A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT | LOCATION | URI | GLOB | REGEXP | ALL | SUB | INC | HTTPVERB | INC_TYPE | COMMA | LPAR | RPAR | WS | COMMENT );";
    },
    dummy: null
});
 
})();