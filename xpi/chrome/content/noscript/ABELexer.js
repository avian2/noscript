// $ANTLR 3.1.1 ABE.g 2011-03-21 12:45:42

var ABELexer = function(input, state) {
// alternate constructor @todo
// public ABELexer(CharStream input)
// public ABELexer(CharStream input, RecognizerSharedState state) {
    if (!state) {
        state = new org.antlr.runtime.RecognizerSharedState();
    }

    (function(){
    }).call(this);

    this.dfa7 = new ABELexer.DFA7(this);
    this.dfa10 = new ABELexer.DFA10(this);
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
            // ABE.g:27:11: ( 'Site' )
            // ABE.g:27:13: 'Site'
            this.match("Site"); 




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
            var alt2=2;
            var LA2_0 = this.input.LA(1);

            if ( (LA2_0=='L') ) {
                alt2=1;
            }
            else if ( (LA2_0=='A') ) {
                alt2=2;
            }
            else {
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 2, 0, this.input);

                throw nvae;
            }
            switch (alt2) {
                case 1 :
                    // ABE.g:30:13: 'Logout'
                    this.match("Logout"); 



                    break;
                case 2 :
                    // ABE.g:30:24: 'Anon' ( 'ymize' )?
                    this.match("Anon"); 

                    // ABE.g:30:31: ( 'ymize' )?
                    var alt1=2;
                    var LA1_0 = this.input.LA(1);

                    if ( (LA1_0=='y') ) {
                        alt1=1;
                    }
                    switch (alt1) {
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
            var cnt3=0;
            loop3:
            do {
                var alt3=2;
                var LA3_0 = this.input.LA(1);

                if ( (LA3_0=='#'||(LA3_0>='%' && LA3_0<='&')||(LA3_0>=',' && LA3_0<=';')||LA3_0=='='||(LA3_0>='?' && LA3_0<='[')||LA3_0==']'||LA3_0=='_'||(LA3_0>='a' && LA3_0<='z')||LA3_0=='~') ) {
                    alt3=1;
                }


                switch (alt3) {
                case 1 :
                    // ABE.g:39:23: URI_PART
                    this.mURI_PART(); 


                    break;

                default :
                    if ( cnt3 >= 1 ) {
                        break loop3;
                    }
                        var eee = new org.antlr.runtime.EarlyExitException(3, this.input);
                        throw eee;
                }
                cnt3++;
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
            loop4:
            do {
                var alt4=2;
                var LA4_0 = this.input.LA(1);

                if ( (LA4_0=='#'||(LA4_0>='%' && LA4_0<='&')||LA4_0=='*'||(LA4_0>=',' && LA4_0<=';')||LA4_0=='='||(LA4_0>='?' && LA4_0<='[')||LA4_0==']'||LA4_0=='_'||(LA4_0>='a' && LA4_0<='z')||LA4_0=='~') ) {
                    alt4=1;
                }


                switch (alt4) {
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
                    break loop4;
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
            var cnt5=0;
            loop5:
            do {
                var alt5=2;
                var LA5_0 = this.input.LA(1);

                if ( ((LA5_0>='\u0000' && LA5_0<='\t')||(LA5_0>='\u000B' && LA5_0<='\uFFFF')) ) {
                    alt5=1;
                }


                switch (alt5) {
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
                    if ( cnt5 >= 1 ) {
                        break loop5;
                    }
                        var eee = new org.antlr.runtime.EarlyExitException(5, this.input);
                        throw eee;
                }
                cnt5++;
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
            var alt6=2;
            var LA6_0 = this.input.LA(1);

            if ( (LA6_0=='L') ) {
                alt6=1;
            }
            switch (alt6) {
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

    // $ANTLR start INC_TYPE
    mINC_TYPE: function()  {
        try {
            var _type = this.INC_TYPE;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:46:12: ( 'OTHER' | 'SCRIPT' | 'IMAGE' | 'CSS' | 'OBJ' | 'SUBDOC' | 'XBL' | 'PING' | 'XHR' | 'OBJSUB' | 'DTD' | 'FONT' | 'MEDIA' )
            var alt7=13;
            alt7 = this.dfa7.predict(this.input);
            switch (alt7) {
                case 1 :
                    // ABE.g:46:14: 'OTHER'
                    this.match("OTHER"); 



                    break;
                case 2 :
                    // ABE.g:46:24: 'SCRIPT'
                    this.match("SCRIPT"); 



                    break;
                case 3 :
                    // ABE.g:46:35: 'IMAGE'
                    this.match("IMAGE"); 



                    break;
                case 4 :
                    // ABE.g:46:45: 'CSS'
                    this.match("CSS"); 



                    break;
                case 5 :
                    // ABE.g:46:53: 'OBJ'
                    this.match("OBJ"); 



                    break;
                case 6 :
                    // ABE.g:46:61: 'SUBDOC'
                    this.match("SUBDOC"); 



                    break;
                case 7 :
                    // ABE.g:46:72: 'XBL'
                    this.match("XBL"); 



                    break;
                case 8 :
                    // ABE.g:46:80: 'PING'
                    this.match("PING"); 



                    break;
                case 9 :
                    // ABE.g:46:89: 'XHR'
                    this.match("XHR"); 



                    break;
                case 10 :
                    // ABE.g:46:97: 'OBJSUB'
                    this.match("OBJSUB"); 



                    break;
                case 11 :
                    // ABE.g:46:108: 'DTD'
                    this.match("DTD"); 



                    break;
                case 12 :
                    // ABE.g:46:116: 'FONT'
                    this.match("FONT"); 



                    break;
                case 13 :
                    // ABE.g:46:125: 'MEDIA'
                    this.match("MEDIA"); 



                    break;

            }
            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "INC_TYPE",

    // $ANTLR start HTTPVERB
    mHTTPVERB: function()  {
        try {
            var _type = this.HTTPVERB;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:47:11: ( 'A' .. 'Z' ( 'A' .. 'Z' )+ )
            // ABE.g:47:13: 'A' .. 'Z' ( 'A' .. 'Z' )+
            this.matchRange('A','Z'); 
            // ABE.g:47:22: ( 'A' .. 'Z' )+
            var cnt8=0;
            loop8:
            do {
                var alt8=2;
                var LA8_0 = this.input.LA(1);

                if ( ((LA8_0>='A' && LA8_0<='Z')) ) {
                    alt8=1;
                }


                switch (alt8) {
                case 1 :
                    // ABE.g:47:22: 'A' .. 'Z'
                    this.matchRange('A','Z'); 


                    break;

                default :
                    if ( cnt8 >= 1 ) {
                        break loop8;
                    }
                        var eee = new org.antlr.runtime.EarlyExitException(8, this.input);
                        throw eee;
                }
                cnt8++;
            } while (true);




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "HTTPVERB",

    // $ANTLR start COMMA
    mCOMMA: function()  {
        try {
            var _type = this.COMMA;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // ABE.g:49:11: ( ',' )
            // ABE.g:49:13: ','
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
            // ABE.g:50:11: ( '(' )
            // ABE.g:50:13: '('
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
            // ABE.g:51:11: ( ')' )
            // ABE.g:51:13: ')'
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
            // ABE.g:53:11: ( ( ' ' | '\\r' | '\\t' | '\\u000C' | '\\n' ) )
            // ABE.g:53:14: ( ' ' | '\\r' | '\\t' | '\\u000C' | '\\n' )
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
            // ABE.g:54:9: ( '#' (~ '\\n' )* )
            // ABE.g:54:11: '#' (~ '\\n' )*
            this.match('#'); 
            // ABE.g:54:15: (~ '\\n' )*
            loop9:
            do {
                var alt9=2;
                var LA9_0 = this.input.LA(1);

                if ( ((LA9_0>='\u0000' && LA9_0<='\t')||(LA9_0>='\u000B' && LA9_0<='\uFFFF')) ) {
                    alt9=1;
                }


                switch (alt9) {
                case 1 :
                    // ABE.g:54:15: ~ '\\n'
                    if ( (this.input.LA(1)>='\u0000' && this.input.LA(1)<='\t')||(this.input.LA(1)>='\u000B' && this.input.LA(1)<='\uFFFF') ) {
                        this.input.consume();

                    }
                    else {
                        var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                        this.recover(mse);
                        throw mse;}



                    break;

                default :
                    break loop9;
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
        // ABE.g:1:8: ( T__28 | T__29 | T__30 | T_SITE | T_FROM | A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT | LOCATION | URI | GLOB | REGEXP | ALL | SUB | INC | INC_TYPE | HTTPVERB | COMMA | LPAR | RPAR | WS | COMMENT )
        var alt10=23;
        alt10 = this.dfa10.predict(this.input);
        switch (alt10) {
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
                // ABE.g:1:114: INC_TYPE
                this.mINC_TYPE(); 


                break;
            case 18 :
                // ABE.g:1:123: HTTPVERB
                this.mHTTPVERB(); 


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
    DFA7_eotS:
        "\u0010\uffff\u0001\u0012\u0002\uffff",
    DFA7_eofS:
        "\u0013\uffff",
    DFA7_minS:
        "\u0001\u0043\u0001\u0042\u0001\u0043\u0002\uffff\u0001\u0042\u0005"+
    "\uffff\u0001\u004a\u0004\uffff\u0001\u0053\u0002\uffff",
    DFA7_maxS:
        "\u0001\u0058\u0001\u0054\u0001\u0055\u0002\uffff\u0001\u0048\u0005"+
    "\uffff\u0001\u004a\u0004\uffff\u0001\u0053\u0002\uffff",
    DFA7_acceptS:
        "\u0003\uffff\u0001\u0003\u0001\u0004\u0001\uffff\u0001\u0008\u0001"+
    "\u000b\u0001\u000c\u0001\u000d\u0001\u0001\u0001\uffff\u0001\u0002\u0001"+
    "\u0006\u0001\u0007\u0001\u0009\u0001\uffff\u0001\u000a\u0001\u0005",
    DFA7_specialS:
        "\u0013\uffff}>",
    DFA7_transitionS: [
            "\u0001\u0004\u0001\u0007\u0001\uffff\u0001\u0008\u0002\uffff"+
            "\u0001\u0003\u0003\uffff\u0001\u0009\u0001\uffff\u0001\u0001"+
            "\u0001\u0006\u0002\uffff\u0001\u0002\u0004\uffff\u0001\u0005",
            "\u0001\u000b\u0011\uffff\u0001\u000a",
            "\u0001\u000c\u0011\uffff\u0001\u000d",
            "",
            "",
            "\u0001\u000e\u0005\uffff\u0001\u000f",
            "",
            "",
            "",
            "",
            "",
            "\u0001\u0010",
            "",
            "",
            "",
            "",
            "\u0001\u0011",
            "",
            ""
    ]
});

org.antlr.lang.augmentObject(ABELexer, {
    DFA7_eot:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA7_eotS),
    DFA7_eof:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA7_eofS),
    DFA7_min:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA7_minS),
    DFA7_max:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA7_maxS),
    DFA7_accept:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA7_acceptS),
    DFA7_special:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA7_specialS),
    DFA7_transition: (function() {
        var a = [],
            i,
            numStates = ABELexer.DFA7_transitionS.length;
        for (i=0; i<numStates; i++) {
            a.push(org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA7_transitionS[i]));
        }
        return a;
    })()
});

ABELexer.DFA7 = function(recognizer) {
    this.recognizer = recognizer;
    this.decisionNumber = 7;
    this.eot = ABELexer.DFA7_eot;
    this.eof = ABELexer.DFA7_eof;
    this.min = ABELexer.DFA7_min;
    this.max = ABELexer.DFA7_max;
    this.accept = ABELexer.DFA7_accept;
    this.special = ABELexer.DFA7_special;
    this.transition = ABELexer.DFA7_transition;
};

org.antlr.lang.extend(ABELexer.DFA7, org.antlr.runtime.DFA, {
    getDescription: function() {
        return "46:1: INC_TYPE : ( 'OTHER' | 'SCRIPT' | 'IMAGE' | 'CSS' | 'OBJ' | 'SUBDOC' | 'XBL' | 'PING' | 'XHR' | 'OBJSUB' | 'DTD' | 'FONT' | 'MEDIA' );";
    },
    dummy: null
});
org.antlr.lang.augmentObject(ABELexer, {
    DFA10_eotS:
        "\u0002\uffff\u0001\u0008\u0004\uffff\u0001\u0008\u000e\uffff\u0001"+
    "\u0010\u0002\uffff\u0002\u0010\u0002\u0032\u0001\uffff\u0001\u0010\u0001"+
    "\uffff\u0001\u0010\u0001\uffff\u0001\u0010\u0001\uffff\u000b\u0010\u0001"+
    "\u0042\u0001\u0010\u0001\u0032\u0001\uffff\u0001\u0045\u0001\u0010\u0001"+
    "\u0047\u0001\u0010\u0001\u0049\u0002\u0010\u0004\u0045\u0002\u0010\u0001"+
    "\u0051\u0001\u0010\u0001\uffff\u0001\u0010\u0001\u0023\u0001\uffff\u0001"+
    "\u0010\u0001\uffff\u0001\u0045\u0001\uffff\u0004\u0010\u0001\u0045\u0001"+
    "\u0010\u0001\u005b\u0001\uffff\u0002\u0010\u0001\u005e\u0001\u0010\u0002"+
    "\u0045\u0001\u0010\u0001\u0045\u0002\uffff\u0002\u0045\u0001\uffff\u0001"+
    "\u0010\u0001\u0045\u0002\u0010\u0001\u0049",
    DFA10_eofS:
        "\u0064\uffff",
    DFA10_minS:
        "\u0001\u0009\u0001\u0041\u0001\u0023\u0004\u0041\u0001\u0023\u0002"+
    "\uffff\u0006\u0041\u0006\uffff\u0001\u004c\u0002\uffff\u0001\u0042\u0001"+
    "\u0052\u0002\u0023\u0001\uffff\u0001\u0044\u0001\uffff\u0001\u0043\u0001"+
    "\uffff\u0001\u004c\u0001\uffff\u0001\u004e\u0001\u0043\u0001\u0041\u0001"+
    "\u0048\u0001\u004a\u0001\u0053\u0001\u004c\u0001\u0052\u0001\u004e\u0001"+
    "\u0044\u0001\u0046\u0001\u0041\u0001\u0049\u0001\u0023\u0001\uffff\u0003"+
    "\u0041\u0001\u0054\u0001\u0041\u0001\u0047\u0001\u0045\u0004\u0041\u0001"+
    "\u0047\u0001\u0049\u0001\u002b\u0001\u004f\u0001\uffff\u0001\u0050\u0001"+
    "\u0023\u0001\uffff\u0001\u004c\u0001\uffff\u0001\u0041\u0001\uffff\u0001"+
    "\u0055\u0001\u0045\u0001\u0052\u0001\u0055\u0002\u0041\u0001\u002b\u0001"+
    "\uffff\u0001\u0043\u0001\u0054\u0001\u0041\u0001\u0053\u0002\u0041\u0001"+
    "\u0042\u0001\u0041\u0002\uffff\u0002\u0041\u0001\uffff\u0001\u0049\u0001"+
    "\u0041\u0001\u004f\u0001\u004e\u0001\u0041",
    DFA10_maxS:
        "\u0001\u007a\u0001\u0069\u0001\u007e\u0001\u0065\u0001\u006f\u0001"+
    "\u006e\u0001\u0072\u0001\u007e\u0002\uffff\u0006\u005a\u0006\uffff\u0001"+
    "\u004c\u0002\uffff\u0001\u0042\u0001\u0052\u0002\u007e\u0001\uffff\u0001"+
    "\u0044\u0001\uffff\u0001\u0043\u0001\uffff\u0001\u004c\u0001\uffff\u0001"+
    "\u004e\u0001\u0043\u0001\u0041\u0001\u0048\u0001\u004a\u0001\u0053\u0001"+
    "\u004c\u0001\u0052\u0001\u004e\u0001\u0044\u0001\u0046\u0001\u005a\u0001"+
    "\u0049\u0001\u007e\u0001\uffff\u0001\u005a\u0001\u0041\u0001\u005a\u0001"+
    "\u0054\u0001\u005a\u0001\u0047\u0001\u0045\u0004\u005a\u0001\u0047\u0001"+
    "\u0049\u0001\u005a\u0001\u004f\u0001\uffff\u0001\u0050\u0001\u007e\u0001"+
    "\uffff\u0001\u004c\u0001\uffff\u0001\u005a\u0001\uffff\u0001\u0055\u0001"+
    "\u0045\u0001\u0052\u0001\u0055\u0001\u005a\u0001\u0041\u0001\u002b\u0001"+
    "\uffff\u0001\u0043\u0001\u0054\u0001\u005a\u0001\u0053\u0002\u005a\u0001"+
    "\u0042\u0001\u005a\u0002\uffff\u0002\u005a\u0001\uffff\u0001\u0049\u0001"+
    "\u005a\u0001\u004f\u0001\u004e\u0001\u005a",
    DFA10_acceptS:
        "\u0008\uffff\u0001\u000c\u0001\u000d\u0006\uffff\u0001\u0012\u0001"+
    "\u0013\u0001\u0014\u0001\u0015\u0001\u0016\u0001\u0017\u0001\uffff\u0001"+
    "\u0004\u0001\u0008\u0004\uffff\u0001\u0006\u0001\uffff\u0001\u0007\u0001"+
    "\uffff\u0001\u0009\u0001\uffff\u0001\u0005\u000e\uffff\u0001\u000b\u000f"+
    "\uffff\u0001\u000f\u0002\uffff\u0001\u0011\u0001\uffff\u0001\u000e\u0001"+
    "\uffff\u0001\u0010\u0007\uffff\u0001\u0001\u0008\uffff\u0001\u0003\u0001"+
    "\u0002\u0002\uffff\u0001\u000a\u0005\uffff",
    DFA10_specialS:
        "\u0064\uffff}>",
    DFA10_transitionS: [
            "\u0002\u0014\u0001\uffff\u0002\u0014\u0012\uffff\u0001\u0014"+
            "\u0002\uffff\u0001\u0015\u0004\uffff\u0001\u0012\u0001\u0013"+
            "\u0001\u0008\u0001\uffff\u0001\u0011\u0001\uffff\u0001\u0008"+
            "\u0001\uffff\u000a\u0007\u0007\uffff\u0001\u0005\u0001\u0010"+
            "\u0001\u000c\u0001\u0003\u0001\u0010\u0001\u0006\u0002\u0010"+
            "\u0001\u000a\u0002\u0010\u0001\u0004\u0001\u000f\u0001\u0010"+
            "\u0001\u000b\u0001\u000e\u0002\u0010\u0001\u0001\u0004\u0010"+
            "\u0001\u000d\u0002\u0010\u0003\uffff\u0001\u0009\u0002\uffff"+
            "\u0005\u0007\u0001\u0002\u0014\u0007",
            "\u0002\u0010\u0001\u001a\u0001\u0010\u0001\u0016\u000f\u0010"+
            "\u0001\u0019\u0005\u0010\u0006\uffff\u0001\u0018\u0007\uffff"+
            "\u0001\u0017",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0005\uffff\u0010\u001c"+
            "\u0001\uffff\u0001\u001c\u0001\uffff\u001d\u001c\u0001\uffff"+
            "\u0001\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0011\u001c"+
            "\u0001\u001b\u0008\u001c\u0003\uffff\u0001\u001c",
            "\u0013\u0010\u0001\u001e\u0006\u0010\u000a\uffff\u0001\u001d",
            "\u000e\u0010\u0001\u0020\u000b\u0010\u0014\uffff\u0001\u001f",
            "\u000b\u0010\u0001\u0022\u000e\u0010\u0008\uffff\u0001\u0021"+
            "\u000a\uffff\u0001\u001f",
            "\u000e\u0010\u0001\u0024\u000b\u0010\u0017\uffff\u0001\u0023",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0005\uffff\u0010\u001c"+
            "\u0001\uffff\u0001\u001c\u0001\uffff\u001d\u001c\u0001\uffff"+
            "\u0001\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u001a\u001c"+
            "\u0003\uffff\u0001\u001c",
            "",
            "",
            "\u000c\u0010\u0001\u0026\u0001\u0025\u000c\u0010",
            "\u0001\u0010\u0001\u0028\u0011\u0010\u0001\u0027\u0006\u0010",
            "\u0012\u0010\u0001\u0029\u0007\u0010",
            "\u0001\u0010\u0001\u002a\u0005\u0010\u0001\u002b\u0012\u0010",
            "\u0008\u0010\u0001\u002c\u0011\u0010",
            "\u0004\u0010\u0001\u002d\u0015\u0010",
            "",
            "",
            "",
            "",
            "",
            "",
            "\u0001\u002e",
            "",
            "",
            "\u0001\u002f",
            "\u0001\u0030",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0003\uffff\u0001\u0008"+
            "\u0001\uffff\u0010\u001c\u0001\uffff\u0001\u001c\u0001\uffff"+
            "\u001d\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0001\u001c"+
            "\u0001\uffff\u000e\u001c\u0001\u0031\u000b\u001c\u0003\uffff"+
            "\u0001\u001c",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0003\uffff\u0001\u0008"+
            "\u0001\uffff\u0010\u001c\u0001\uffff\u0001\u001c\u0001\uffff"+
            "\u001d\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0001\u001c"+
            "\u0001\uffff\u001a\u001c\u0003\uffff\u0001\u001c",
            "",
            "\u0001\u0033",
            "",
            "\u0001\u0034",
            "",
            "\u0001\u0035",
            "",
            "\u0001\u0036",
            "\u0001\u0037",
            "\u0001\u0038",
            "\u0001\u0039",
            "\u0001\u003a",
            "\u0001\u003b",
            "\u0001\u003c",
            "\u0001\u003d",
            "\u0001\u003e",
            "\u0001\u003f",
            "\u0001\u0040",
            "\u0003\u0010\u0001\u0041\u0016\u0010",
            "\u0001\u0043",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0003\uffff\u0001\u0008"+
            "\u0001\uffff\u0010\u001c\u0001\uffff\u0001\u001c\u0001\uffff"+
            "\u001d\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0001\u001c"+
            "\u0001\uffff\u000c\u001c\u0001\u0044\u000d\u001c\u0003\uffff"+
            "\u0001\u001c",
            "",
            "\u001a\u0010",
            "\u0001\u0046",
            "\u001a\u0010",
            "\u0001\u0048",
            "\u000b\u0010\u0001\u004a\u000e\u0010",
            "\u0001\u004b",
            "\u0001\u004c",
            "\u0012\u0010\u0001\u004d\u0007\u0010",
            "\u001a\u0010",
            "\u001a\u0010",
            "\u001a\u0010",
            "\u0001\u004e",
            "\u0001\u004f",
            "\u0001\u0050\u0015\uffff\u001a\u0010",
            "\u0001\u0052",
            "",
            "\u0001\u0053",
            "\u0001\u001c\u0001\uffff\u0002\u001c\u0003\uffff\u0001\u0008"+
            "\u0001\uffff\u0010\u001c\u0001\uffff\u0001\u001c\u0001\uffff"+
            "\u001d\u001c\u0001\uffff\u0001\u001c\u0001\uffff\u0001\u001c"+
            "\u0001\uffff\u001a\u001c\u0003\uffff\u0001\u001c",
            "",
            "\u0001\u0054",
            "",
            "\u001a\u0010",
            "",
            "\u0001\u0055",
            "\u0001\u0056",
            "\u0001\u0057",
            "\u0001\u0058",
            "\u001a\u0010",
            "\u0001\u0059",
            "\u0001\u005a",
            "",
            "\u0001\u005c",
            "\u0001\u005d",
            "\u001a\u0010",
            "\u0001\u005f",
            "\u001a\u0010",
            "\u001a\u0010",
            "\u0001\u0060",
            "\u001a\u0010",
            "",
            "",
            "\u001a\u0010",
            "\u001a\u0010",
            "",
            "\u0001\u0061",
            "\u001a\u0010",
            "\u0001\u0062",
            "\u0001\u0063",
            "\u001a\u0010"
    ]
});

org.antlr.lang.augmentObject(ABELexer, {
    DFA10_eot:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA10_eotS),
    DFA10_eof:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA10_eofS),
    DFA10_min:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA10_minS),
    DFA10_max:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA10_maxS),
    DFA10_accept:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA10_acceptS),
    DFA10_special:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA10_specialS),
    DFA10_transition: (function() {
        var a = [],
            i,
            numStates = ABELexer.DFA10_transitionS.length;
        for (i=0; i<numStates; i++) {
            a.push(org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA10_transitionS[i]));
        }
        return a;
    })()
});

ABELexer.DFA10 = function(recognizer) {
    this.recognizer = recognizer;
    this.decisionNumber = 10;
    this.eot = ABELexer.DFA10_eot;
    this.eof = ABELexer.DFA10_eof;
    this.min = ABELexer.DFA10_min;
    this.max = ABELexer.DFA10_max;
    this.accept = ABELexer.DFA10_accept;
    this.special = ABELexer.DFA10_special;
    this.transition = ABELexer.DFA10_transition;
};

org.antlr.lang.extend(ABELexer.DFA10, org.antlr.runtime.DFA, {
    getDescription: function() {
        return "1:1: Tokens : ( T__28 | T__29 | T__30 | T_SITE | T_FROM | A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT | LOCATION | URI | GLOB | REGEXP | ALL | SUB | INC | INC_TYPE | HTTPVERB | COMMA | LPAR | RPAR | WS | COMMENT );";
    },
    dummy: null
});
 
})();