// $ANTLR 3.1.1 X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g 2009-07-12 21:45:06

var ABELexer = function(input, state) {
// alternate constructor @todo
// public ABELexer(CharStream input)
// public ABELexer(CharStream input, RecognizerSharedState state) {
    if (!state) {
        state = new org.antlr.runtime.RecognizerSharedState();
    }

    (function(){
    }).call(this);

    this.dfa9 = new ABELexer.DFA9(this);
    ABELexer.superclass.constructor.call(this, input, state);


};

org.antlr.lang.augmentObject(ABELexer, {
    T_FROM: 9,
    GLOB: 12,
    HTTPVERB: 7,
    A_LOGOUT: 16,
    A_DENY: 15,
    T_ACTION: 4,
    SUB: 8,
    T_METHODS: 5,
    EOF: -1,
    URI: 13,
    WS: 21,
    URI_PART: 20,
    A_SANDBOX: 17,
    URI_START: 19,
    ALL: 6,
    A_ACCEPT: 18,
    REGEXP: 11,
    LOCATION: 14,
    T_SITE: 10,
    COMMENT: 22
});

(function(){
var HIDDEN = org.antlr.runtime.Token.HIDDEN_CHANNEL,
    EOF = org.antlr.runtime.Token.EOF;
org.antlr.lang.extend(ABELexer, org.antlr.runtime.Lexer, {
    T_FROM : 9,
    GLOB : 12,
    HTTPVERB : 7,
    A_LOGOUT : 16,
    A_DENY : 15,
    T_ACTION : 4,
    SUB : 8,
    T_METHODS : 5,
    EOF : -1,
    URI : 13,
    WS : 21,
    URI_PART : 20,
    A_SANDBOX : 17,
    URI_START : 19,
    ALL : 6,
    A_ACCEPT : 18,
    REGEXP : 11,
    LOCATION : 14,
    T_SITE : 10,
    COMMENT : 22,
    getGrammarFileName: function() { return "X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g"; }
});
org.antlr.lang.augmentObject(ABELexer.prototype, {
    // $ANTLR start T_SITE
    mT_SITE: function()  {
        try {
            var _type = this.T_SITE;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:34:11: ( 'Site' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:34:13: 'Site'
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:35:11: ( ( 'f' | 'F' ) 'rom' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:35:13: ( 'f' | 'F' ) 'rom'
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:36:11: ( 'Deny' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:36:13: 'Deny'
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:37:11: ( 'Logout' | 'Anon' ( 'ymize' )? )
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
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:37:13: 'Logout'
                    this.match("Logout"); 



                    break;
                case 2 :
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:37:24: 'Anon' ( 'ymize' )?
                    this.match("Anon"); 

                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:37:31: ( 'ymize' )?
                    var alt1=2;
                    var LA1_0 = this.input.LA(1);

                    if ( (LA1_0=='y') ) {
                        alt1=1;
                    }
                    switch (alt1) {
                        case 1 :
                            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:37:31: 'ymize'
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:38:11: ( 'Sandbox' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:38:13: 'Sandbox'
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:39:11: ( 'Accept' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:39:13: 'Accept'
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:41:20: ( 'a' .. 'z' | '0' .. '9' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:43:20: ( 'a' .. 'z' | 'A' .. 'Z' | '0' .. '9' | '_' | '-' | '.' | '[' | ']' | ':' | '/' | '@' | '~' | ';' | ',' | '?' | '&' | '=' | '%' | '#' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:47:11: ( 'LOCAL' | 'SELF' )
            var alt3=2;
            var LA3_0 = this.input.LA(1);

            if ( (LA3_0=='L') ) {
                alt3=1;
            }
            else if ( (LA3_0=='S') ) {
                alt3=2;
            }
            else {
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 3, 0, this.input);

                throw nvae;
            }
            switch (alt3) {
                case 1 :
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:47:13: 'LOCAL'
                    this.match("LOCAL"); 



                    break;
                case 2 :
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:47:23: 'SELF'
                    this.match("SELF"); 



                    break;

            }
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:49:11: ( URI_START ( URI_PART )+ )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:49:13: URI_START ( URI_PART )+
            this.mURI_START(); 
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:49:23: ( URI_PART )+
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
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:49:23: URI_PART
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:51:11: ( ( URI_START | '*' ) ( URI_PART | '*' )* )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:51:13: ( URI_START | '*' ) ( URI_PART | '*' )*
            if ( this.input.LA(1)=='*'||(this.input.LA(1)>='0' && this.input.LA(1)<='9')||(this.input.LA(1)>='a' && this.input.LA(1)<='z') ) {
                this.input.consume();

            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                this.recover(mse);
                throw mse;}

            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:51:31: ( URI_PART | '*' )*
            loop5:
            do {
                var alt5=2;
                var LA5_0 = this.input.LA(1);

                if ( (LA5_0=='#'||(LA5_0>='%' && LA5_0<='&')||LA5_0=='*'||(LA5_0>=',' && LA5_0<=';')||LA5_0=='='||(LA5_0>='?' && LA5_0<='[')||LA5_0==']'||LA5_0=='_'||(LA5_0>='a' && LA5_0<='z')||LA5_0=='~') ) {
                    alt5=1;
                }


                switch (alt5) {
                case 1 :
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:53:11: ( '^' (~ '\\n' )+ )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:53:13: '^' (~ '\\n' )+
            this.match('^'); 
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:53:17: (~ '\\n' )+
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
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:53:17: ~ '\\n'
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:55:7: ( 'ALL' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:55:9: 'ALL'
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:57:7: ( 'SUB' )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:57:9: 'SUB'
            this.match("SUB"); 




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "SUB",

    // $ANTLR start HTTPVERB
    mHTTPVERB: function()  {
        try {
            var _type = this.HTTPVERB;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:59:11: ( 'A' .. 'Z' ( 'A' .. 'Z' )+ )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:59:13: 'A' .. 'Z' ( 'A' .. 'Z' )+
            this.matchRange('A','Z'); 
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:59:22: ( 'A' .. 'Z' )+
            var cnt7=0;
            loop7:
            do {
                var alt7=2;
                var LA7_0 = this.input.LA(1);

                if ( ((LA7_0>='A' && LA7_0<='Z')) ) {
                    alt7=1;
                }


                switch (alt7) {
                case 1 :
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:59:22: 'A' .. 'Z'
                    this.matchRange('A','Z'); 


                    break;

                default :
                    if ( cnt7 >= 1 ) {
                        break loop7;
                    }
                        var eee = new org.antlr.runtime.EarlyExitException(7, this.input);
                        throw eee;
                }
                cnt7++;
            } while (true);




            this.state.type = _type;
            this.state.channel = _channel;
        }
        finally {
        }
    },
    // $ANTLR end "HTTPVERB",

    // $ANTLR start WS
    mWS: function()  {
        try {
            var _type = this.WS;
            var _channel = org.antlr.runtime.BaseRecognizer.DEFAULT_TOKEN_CHANNEL;
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:62:5: ( ( ' ' | '\\r' | '\\t' | '\\u000C' | '\\n' ) )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:62:8: ( ' ' | '\\r' | '\\t' | '\\u000C' | '\\n' )
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
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:64:9: ( '#' (~ '\\n' )* )
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:64:11: '#' (~ '\\n' )*
            this.match('#'); 
            // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:64:15: (~ '\\n' )*
            loop8:
            do {
                var alt8=2;
                var LA8_0 = this.input.LA(1);

                if ( ((LA8_0>='\u0000' && LA8_0<='\t')||(LA8_0>='\u000B' && LA8_0<='\uFFFF')) ) {
                    alt8=1;
                }


                switch (alt8) {
                case 1 :
                    // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:64:15: ~ '\\n'
                    if ( (this.input.LA(1)>='\u0000' && this.input.LA(1)<='\t')||(this.input.LA(1)>='\u000B' && this.input.LA(1)<='\uFFFF') ) {
                        this.input.consume();

                    }
                    else {
                        var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                        this.recover(mse);
                        throw mse;}



                    break;

                default :
                    break loop8;
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
        // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:8: ( T_SITE | T_FROM | A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT | LOCATION | URI | GLOB | REGEXP | ALL | SUB | HTTPVERB | WS | COMMENT )
        var alt9=15;
        alt9 = this.dfa9.predict(this.input);
        switch (alt9) {
            case 1 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:10: T_SITE
                this.mT_SITE(); 


                break;
            case 2 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:17: T_FROM
                this.mT_FROM(); 


                break;
            case 3 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:24: A_DENY
                this.mA_DENY(); 


                break;
            case 4 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:31: A_LOGOUT
                this.mA_LOGOUT(); 


                break;
            case 5 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:40: A_SANDBOX
                this.mA_SANDBOX(); 


                break;
            case 6 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:50: A_ACCEPT
                this.mA_ACCEPT(); 


                break;
            case 7 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:59: LOCATION
                this.mLOCATION(); 


                break;
            case 8 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:68: URI
                this.mURI(); 


                break;
            case 9 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:72: GLOB
                this.mGLOB(); 


                break;
            case 10 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:77: REGEXP
                this.mREGEXP(); 


                break;
            case 11 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:84: ALL
                this.mALL(); 


                break;
            case 12 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:88: SUB
                this.mSUB(); 


                break;
            case 13 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:92: HTTPVERB
                this.mHTTPVERB(); 


                break;
            case 14 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:101: WS
                this.mWS(); 


                break;
            case 15 :
                // X:\\CVS\\mozilla\\noscript\\ABE\\0.6\\ABE.g:1:104: COMMENT
                this.mCOMMENT(); 


                break;

        }

    }

}, true); // important to pass true to overwrite default implementations

org.antlr.lang.augmentObject(ABELexer, {
    DFA9_eotS:
        "\u0002\uffff\u0001\u0008\u0004\uffff\u0001\u0008\u0007\uffff\u0002"+
    "\u000a\u0002\u001c\u0002\uffff\u0001\u000a\u0001\uffff\u0001\u000a\u0001"+
    "\uffff\u0001\u000a\u0001\u0020\u0001\u001c\u0001\uffff\u0001\u000a\u0001"+
    "\u0023\u0001\u0024\u0001\uffff\u0001\u0018\u0001\u000a\u0002\uffff\u0001"+
    "\u0024",
    DFA9_eofS:
        "\u0026\uffff",
    DFA9_minS:
        "\u0001\u0009\u0001\u0041\u0001\u0023\u0004\u0041\u0001\u0023\u0007"+
    "\uffff\u0001\u004c\u0001\u0042\u0002\u0023\u0002\uffff\u0001\u0043\u0001"+
    "\uffff\u0001\u004c\u0001\uffff\u0001\u0046\u0001\u0041\u0001\u0023\u0001"+
    "\uffff\u0003\u0041\u0001\uffff\u0001\u0023\u0001\u004c\u0002\uffff\u0001"+
    "\u0041",
    DFA9_maxS:
        "\u0001\u007a\u0001\u0069\u0001\u007e\u0001\u0065\u0001\u006f\u0001"+
    "\u006e\u0001\u0072\u0001\u007e\u0007\uffff\u0001\u004c\u0001\u0042\u0002"+
    "\u007e\u0002\uffff\u0001\u0043\u0001\uffff\u0001\u004c\u0001\uffff\u0001"+
    "\u0046\u0001\u005a\u0001\u007e\u0001\uffff\u0001\u0041\u0002\u005a\u0001"+
    "\uffff\u0001\u007e\u0001\u004c\u0002\uffff\u0001\u005a",
    DFA9_acceptS:
        "\u0008\uffff\u0001\u0009\u0001\u000a\u0001\u000d\u0001\u000e\u0001"+
    "\u000f\u0001\u0001\u0001\u0005\u0004\uffff\u0001\u0003\u0001\u0004\u0001"+
    "\uffff\u0001\u0006\u0001\uffff\u0001\u0002\u0003\uffff\u0001\u0008\u0003"+
    "\uffff\u0001\u000c\u0002\uffff\u0001\u000b\u0001\u0007\u0001\uffff",
    DFA9_specialS:
        "\u0026\uffff}>",
    DFA9_transitionS: [
            "\u0002\u000b\u0001\uffff\u0002\u000b\u0012\uffff\u0001\u000b"+
            "\u0002\uffff\u0001\u000c\u0006\uffff\u0001\u0008\u0005\uffff"+
            "\u000a\u0007\u0007\uffff\u0001\u0005\u0002\u000a\u0001\u0003"+
            "\u0001\u000a\u0001\u0006\u0005\u000a\u0001\u0004\u0006\u000a"+
            "\u0001\u0001\u0007\u000a\u0003\uffff\u0001\u0009\u0002\uffff"+
            "\u0005\u0007\u0001\u0002\u0014\u0007",
            "\u0004\u000a\u0001\u000f\u000f\u000a\u0001\u0010\u0005\u000a"+
            "\u0006\uffff\u0001\u000e\u0007\uffff\u0001\u000d",
            "\u0001\u0012\u0001\uffff\u0002\u0012\u0005\uffff\u0010\u0012"+
            "\u0001\uffff\u0001\u0012\u0001\uffff\u001d\u0012\u0001\uffff"+
            "\u0001\u0012\u0001\uffff\u0001\u0012\u0001\uffff\u0011\u0012"+
            "\u0001\u0011\u0008\u0012\u0003\uffff\u0001\u0012",
            "\u001a\u000a\u000a\uffff\u0001\u0013",
            "\u000e\u000a\u0001\u0015\u000b\u000a\u0014\uffff\u0001\u0014",
            "\u000b\u000a\u0001\u0017\u000e\u000a\u0008\uffff\u0001\u0016"+
            "\u000a\uffff\u0001\u0014",
            "\u001a\u000a\u0017\uffff\u0001\u0018",
            "\u0001\u0012\u0001\uffff\u0002\u0012\u0005\uffff\u0010\u0012"+
            "\u0001\uffff\u0001\u0012\u0001\uffff\u001d\u0012\u0001\uffff"+
            "\u0001\u0012\u0001\uffff\u0001\u0012\u0001\uffff\u001a\u0012"+
            "\u0003\uffff\u0001\u0012",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "\u0001\u0019",
            "\u0001\u001a",
            "\u0001\u0012\u0001\uffff\u0002\u0012\u0003\uffff\u0001\u0008"+
            "\u0001\uffff\u0010\u0012\u0001\uffff\u0001\u0012\u0001\uffff"+
            "\u001d\u0012\u0001\uffff\u0001\u0012\u0001\uffff\u0001\u0012"+
            "\u0001\uffff\u000e\u0012\u0001\u001b\u000b\u0012\u0003\uffff"+
            "\u0001\u0012",
            "\u0001\u0012\u0001\uffff\u0002\u0012\u0003\uffff\u0001\u0008"+
            "\u0001\uffff\u0010\u0012\u0001\uffff\u0001\u0012\u0001\uffff"+
            "\u001d\u0012\u0001\uffff\u0001\u0012\u0001\uffff\u0001\u0012"+
            "\u0001\uffff\u001a\u0012\u0003\uffff\u0001\u0012",
            "",
            "",
            "\u0001\u001d",
            "",
            "\u0001\u001e",
            "",
            "\u0001\u001f",
            "\u001a\u000a",
            "\u0001\u0012\u0001\uffff\u0002\u0012\u0003\uffff\u0001\u0008"+
            "\u0001\uffff\u0010\u0012\u0001\uffff\u0001\u0012\u0001\uffff"+
            "\u001d\u0012\u0001\uffff\u0001\u0012\u0001\uffff\u0001\u0012"+
            "\u0001\uffff\u000c\u0012\u0001\u0021\u000d\u0012\u0003\uffff"+
            "\u0001\u0012",
            "",
            "\u0001\u0022",
            "\u001a\u000a",
            "\u001a\u000a",
            "",
            "\u0001\u0012\u0001\uffff\u0002\u0012\u0003\uffff\u0001\u0008"+
            "\u0001\uffff\u0010\u0012\u0001\uffff\u0001\u0012\u0001\uffff"+
            "\u001d\u0012\u0001\uffff\u0001\u0012\u0001\uffff\u0001\u0012"+
            "\u0001\uffff\u001a\u0012\u0003\uffff\u0001\u0012",
            "\u0001\u0025",
            "",
            "",
            "\u001a\u000a"
    ]
});

org.antlr.lang.augmentObject(ABELexer, {
    DFA9_eot:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA9_eotS),
    DFA9_eof:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA9_eofS),
    DFA9_min:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA9_minS),
    DFA9_max:
        org.antlr.runtime.DFA.unpackEncodedStringToUnsignedChars(ABELexer.DFA9_maxS),
    DFA9_accept:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA9_acceptS),
    DFA9_special:
        org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA9_specialS),
    DFA9_transition: (function() {
        var a = [],
            i,
            numStates = ABELexer.DFA9_transitionS.length;
        for (i=0; i<numStates; i++) {
            a.push(org.antlr.runtime.DFA.unpackEncodedString(ABELexer.DFA9_transitionS[i]));
        }
        return a;
    })()
});

ABELexer.DFA9 = function(recognizer) {
    this.recognizer = recognizer;
    this.decisionNumber = 9;
    this.eot = ABELexer.DFA9_eot;
    this.eof = ABELexer.DFA9_eof;
    this.min = ABELexer.DFA9_min;
    this.max = ABELexer.DFA9_max;
    this.accept = ABELexer.DFA9_accept;
    this.special = ABELexer.DFA9_special;
    this.transition = ABELexer.DFA9_transition;
};

org.antlr.lang.extend(ABELexer.DFA9, org.antlr.runtime.DFA, {
    getDescription: function() {
        return "1:1: Tokens : ( T_SITE | T_FROM | A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT | LOCATION | URI | GLOB | REGEXP | ALL | SUB | HTTPVERB | WS | COMMENT );";
    },
    dummy: null
});
 
})();