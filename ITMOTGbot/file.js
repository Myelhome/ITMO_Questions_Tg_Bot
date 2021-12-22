const {Telegraf} = require('telegraf')
const {Markup, Extra} = Telegraf
const bot = new Telegraf('****')


const AWS = require('aws-sdk');
// Set the region
AWS.config.update({
    "accessKeyId": "****",
    "secretAccessKey": "****",
    "region": "****"
});
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const docClient = new AWS.DynamoDB.DocumentClient();

function hash(input) {
    var hash = 0, i, chr;
    if (input.length === 0) return hash;
    for (i = 0; i < input.length; i++) {
        chr = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
}

//db logic
function auth(ctx, callback) {
    var params = {
        TableName: 'Telegram_users',
        Key: {
            'pk': {S: ctx.message.chat.id.toString()}
        }
    };

    ddb.getItem(params, function (err, data) {
        if (err) {
            ctx.reply("Some error occurred")
            return callback(false);
        } else if (!data.Item) {
            ctx.reply("Not registered, use /register")
            return callback(false);
        } else {
            return callback(data.Item);
        }
    });
}

function adminAuth(ctx, callback) {
    var params = {
        TableName: 'Telegram_users',
        Key: {
            'pk': {S: ctx.message.chat.id.toString()}
        }
    };

    ddb.getItem(params, function (err, data) {
        if (err) {
            ctx.reply("Some error occurred")
            return callback(false);
        } else if (!data.Item) {
            ctx.reply("Not registered, use /register")
            return callback(false);
        } else {
            if (data.Item.admin && data.Item.admin.BOOL === true) {
                return callback(data.Item);
            } else {
                ctx.reply("This functionality is allowed for admins only")
                return callback(false);
            }
        }
    });
}

bot.start((ctx) => ctx.reply('Welcome'))

bot.command('register', (ctx) => {
    var chatId = ctx.message.chat.id.toString()

    var params1 = {
        TableName: 'Telegram_users',
        Key: {
            'pk': {S: ctx.message.chat.id.toString()}
        }
    };

    ddb.getItem(params1, function (err, data) {
        if (err) {
            ctx.reply("Some error occurred")
        } else if (!data.Item) {
            var params = {
                TableName: 'Telegram_users',
                Item: {
                    'pk': {S: chatId},
                    'status': {S: 'setName'}
                }
            };
            ddb.putItem(params, function (err, data) {
                if (err) {
                    console.log("Error", err);
                } else {
                    ctx.reply('Registering');
                    ctx.reply('Type your name')
                }
            });
        } else {
            ctx.reply("Already registered")
        }
    });
})

bot.command('info', (ctx) => {
    console.log(bot.botInfo)

    const chatId = ctx.message.chat.id.toString()

    auth(ctx, function (user) {
        if (user) {
            ctx.telegram.sendMessage(
                chatId,
                "Hi, " + user.name.S + "\n" + "Your grade: " + user.grade.S + "\n" + "Your email: " + user.email.S)
        }
    })
})

bot.command('personalQuestion', (ctx) => {
    const chatId = ctx.message.chat.id.toString()

    auth(ctx, function (user) {
        if (user) {
            //update status
            user.status = {S: "personalQuestion"}
            var paramsUpd = {
                TableName: 'Telegram_users',
                Item: user
            };
            ddb.putItem(paramsUpd, function (err, data) {
                if (err) {
                    console.log("Error", err);
                } else {
                    ctx.reply('Send us Your question ir reply: ')
                }
            });
        }
    })
})

bot.command('questions', (ctx) => {
    const chatId = ctx.message.chat.id.toString()

    auth(ctx, function (user) {
        if (user) {
            var params = {
                TableName: "Telegram_default_questions"
            };

            docClient.scan(params, onScan);

            function onScan(err, data) {
                if (err) {
                    console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                } else {
                    var btns = [];

                    // print all categories
                    var reply = "Categories: \n"

                    var count = 1;
                    data.Items.forEach(function (record) {
                        btns.push([{
                            text: record.name,
                            callback_data: "test",
                        }])

                        reply = reply + '[' + count.toString() + '] ' + record.name + "\n";
                        record.questions.forEach(function (q) {
                            reply = reply + "   Q:" + q.split("#")[0] + "\n" + "   A:" + q.split("#")[1] + "\n\n"
                        });

                        count++;
                    });

                    reply = reply + "Your question is not answered? Use /personalQuestion to ask"

                    ctx.reply(
                        reply,
                        // {
                        //     reply_markup: {inline_keyboard: btns}
                        // }
                    );

                    // continue scanning if we have more movies, because
                    // scan can retrieve a maximum of 1MB of data
                    if (typeof data.LastEvaluatedKey != "undefined") {
                        console.log("Scanning for more...");
                        params.ExclusiveStartKey = data.LastEvaluatedKey;
                        docClient.scan(params, onScan);
                    }
                }
            }
        }
    })
})

bot.action('test', async (ctx) => {
    console.log(ctx)
})

bot.command('becomeAdmin', (ctx) => {
    const chatId = ctx.message.chat.id.toString()

    let pwd = ctx.message.text;
    pwd = pwd.substring(13).trim()

    auth(ctx, function (user) {
        if (user) {
            if (user.admin && user.admin.BOOL === true) {
                ctx.reply('Already admin')
            } else if (pwd === 'admin_password_1234') {
                console.log("new admin" + chatId);
                user.admin = {BOOL: true};
                params = {
                    TableName: 'Telegram_users',
                    Item: user
                };
                ddb.putItem(params, function (err, data) {
                    if (err) {
                        console.log("Error", err);
                    } else {
                        ctx.reply('Yore are admin from now')
                    }
                });
            } else {
                ctx.reply("Wrong password")
            }
        }
    })
})

bot.command('addCategory', (ctx) => {
    const chatId = ctx.message.chat.id.toString()

    let text = ctx.message.text;
    text = text.substring(13)

    let textHash = hash(text)

    adminAuth(ctx, function (user) {
        if (user) {

            var paramsGetCat = {
                TableName: 'Telegram_default_questions',
                Key: {
                    'pk': {S: textHash}
                }
            };

            ddb.getItem(paramsGetCat, function (err, data) {
                if (err) {
                    ctx.reply("Some error occurred")
                } else if (data.Item) {
                    ctx.reply("Category '" + data.Item.name.S + "' already exists")
                } else {
                    var params = {
                        TableName: 'Telegram_default_questions',
                        Item: {
                            'pk': {S: textHash},
                            'name': {S: text},
                            'questions': {L: []}
                        }
                    };
                    ddb.putItem(params, function (err, data) {
                        if (err) {
                            console.log("Error", err);
                        } else {
                            ctx.reply('Created category')
                        }
                    });
                }
            });
        }
    })
})

bot.command('answerQuestions', (ctx) => {
    const chatId = ctx.message.chat.id.toString()

    let text = ctx.message.text;

    adminAuth(ctx, function (user) {
        if (user) {
            var params = {
                TableName: "Telegram_personal_questions"
            };

            docClient.scan(params, onScan);

            function onScan(err, data) {
                if (err) {
                    console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                } else {
                    // print all the movies
                    var reply = "Questions [name : qid : question]\n"

                    data.Items.forEach(function (record) {
                        if (record.open === true)
                            reply = reply + (record.name + " : " + record.pk + " : " + record.question + "\n\n");
                    });

                    ctx.reply(reply);

                    //update status
                    user.status = {S: "answerQuestions"}
                    var paramsUpd = {
                        TableName: 'Telegram_users',
                        Item: user
                    };
                    ddb.putItem(paramsUpd, function (err, data) {
                        if (err) {
                            console.log("Error", err);
                        } else {
                            ctx.reply("Answer questions\nFormat: [qid]#[answer]")
                        }
                    });

                    // continue scanning if we have more movies, because
                    // scan can retrieve a maximum of 1MB of data
                    if (typeof data.LastEvaluatedKey != "undefined") {
                        console.log("Scanning for more...");
                        params.ExclusiveStartKey = data.LastEvaluatedKey;
                        docClient.scan(params, onScan);
                    }
                }
            }
        }
    })
})

bot.command('addQuestions', (ctx) => {
    const chatId = ctx.message.chat.id.toString()

    let text = ctx.message.text;

    adminAuth(ctx, function (user) {
        if (user) {
            var params = {
                TableName: "Telegram_default_questions"
            };

            docClient.scan(params, onScan);

            function onScan(err, data) {
                if (err) {
                    console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                } else {
                    // print all the movies
                    var reply = "Categories [catId : name] :\n"

                    data.Items.forEach(function (record) {
                        reply = reply + (record.pk + " : " + record.name + "\n");
                    });

                    ctx.reply(reply);

                    //update status
                    user.status = {S: "addQuestions"}
                    var paramsUpd = {
                        TableName: 'Telegram_users',
                        Item: user
                    };
                    ddb.putItem(paramsUpd, function (err, data) {
                        if (err) {
                            console.log("Error", err);
                        } else {
                            ctx.reply('Choose category and specify question\nFormat: [categoryId]#[question]#[answer]\nuse /saveQuestions after')
                        }
                    });

                    // continue scanning if we have more movies, because
                    // scan can retrieve a maximum of 1MB of data
                    if (typeof data.LastEvaluatedKey != "undefined") {
                        console.log("Scanning for more...");
                        params.ExclusiveStartKey = data.LastEvaluatedKey;
                        docClient.scan(params, onScan);
                    }
                }
            }
        }
    })
})

bot.command('saveQuestions', (ctx) => {
    const chatId = ctx.message.chat.id.toString()

    let text = ctx.message.text;

    adminAuth(ctx, function (user) {
        if (user) {
            if (user.status.S === "addQuestions") {
                //update status
                user.status = {S: "none"}
                var paramsUpd = {
                    TableName: 'Telegram_users',
                    Item: user
                };
                ddb.putItem(paramsUpd, function (err, data) {
                    if (err) {
                        console.log("Error", err);
                    } else {
                        ctx.reply('Questions are saved')
                    }
                });
            } else {
                ctx.reply("Enable setQuestions mode with /addQuestions")
            }
        }
    })
})

bot.on('text', (ctx) => {
    if (!ctx.message.text.startsWith("/")) {
        var chatId = ctx.message.chat.id.toString()
        var text = ctx.message.text

        var params = {
            TableName: 'Telegram_users',
            Key: {
                'pk': {S: chatId}
            }
        };

        ddb.getItem(params, function (err, data) {
            var params;

            if (err) {
                console.log("Error", err);
            } else if (!data.Item || (data.Item.status && data.Item.status.S === 'none')) {
                ctx.reply('Didnt get you, see help page')
            } else {
                switch (data.Item.status.S) {
                    case "setName":
                        console.log("set Name");
                        data.Item.name = {S: text};
                        data.Item.status = {S: "setGrade"}
                        params = {
                            TableName: 'Telegram_users',
                            Item: data.Item
                        };
                        ddb.putItem(params, function (err, data) {
                            if (err) {
                                console.log("Error", err);
                            } else {
                                ctx.reply('Type your grade')
                            }
                        });
                        break;

                    case "setGrade":
                        console.log("set Grade");
                        data.Item.grade = {S: text};
                        data.Item.status = {S: "setEmail"}
                        params = {
                            TableName: 'Telegram_users',
                            Item: data.Item
                        };
                        ddb.putItem(params, function (err, data) {
                            if (err) {
                                console.log("Error", err);
                            } else {
                                ctx.reply('Type your email')
                            }
                        });
                        break;

                    case "setEmail":
                        console.log("set Email");
                        data.Item.email = {S: text};
                        data.Item.status = {S: "none"}
                        params = {
                            TableName: 'Telegram_users',
                            Item: data.Item
                        };
                        ddb.putItem(params, function (err, data) {
                            if (err) {
                                console.log("Error", err);
                            } else {
                                ctx.reply('Success registration')
                            }
                        });
                        break;

                    case "personalQuestion":
                        console.log("personal question");

                        var pk = hash(text)

                        paramsQ = {
                            TableName: 'Telegram_personal_questions',
                            Item: {
                                'pk': {S: pk},
                                'messageId': {S: ctx.message.message_id.toString()},
                                'open': {BOOL: true},
                                'question': {S: text},
                                'name': {S: data.Item.name.S},
                                'email': {S: data.Item.email.S},
                                'grade': {S: data.Item.grade.S},
                                'chatId': {S: chatId}
                            }
                        };

                        ddb.putItem(paramsQ, function (err, resp) {
                            if (err) {
                                console.log("Error", err);
                            } else {
                                data.Item.email = {S: text};
                                data.Item.status = {S: "none"}
                                params = {
                                    TableName: 'Telegram_users',
                                    Item: data.Item
                                };
                                ddb.putItem(params, function (err, data) {
                                    if (err) {
                                        console.log("Error", err);
                                    } else {
                                        ctx.reply('Your question is saved, we will answer it asap')
                                    }
                                });
                            }
                        });
                        break;

                    case "addQuestions":
                        console.log("add Question");

                        const myArray = text.split("#");

                        if (myArray.length === 3) {
                            var paramsGetCat = {
                                TableName: 'Telegram_default_questions',
                                Key: {
                                    'pk': {S: myArray[0]}
                                }
                            };

                            ddb.getItem(paramsGetCat, function (err, data) {
                                if (err) {
                                    ctx.reply("Some error occurred")
                                } else if (data.Item) {
                                    //todo
                                    var list = data.Item.questions.L

                                    list.push({S: myArray[1] + "#" + myArray[2]})

                                    data.Item.questions = {L: list}

                                    params = {
                                        TableName: 'Telegram_default_questions',
                                        Item: data.Item
                                    };

                                    ddb.putItem(params, function (err, data) {
                                        if (err) {
                                            console.log("Error", err);
                                        } else {
                                            ctx.reply('Question was added')
                                        }
                                    });
                                } else {
                                    ctx.reply("No category with such id")
                                }
                            });
                        } else {
                            ctx.reply("Wrong format")
                        }

                        break;

                    case "answerQuestions":
                        console.log("add Question");

                        const arr = text.split("#");

                        if (arr.length === 2) {
                            var paramsGetPQ = {
                                TableName: 'Telegram_personal_questions',
                                Key: {
                                    'pk': {S: arr[0]}
                                }
                            };

                            ddb.getItem(paramsGetPQ, function (err, dataPq) {
                                if (err) {
                                    ctx.reply("Some error occurred")
                                } else if (dataPq.Item) {
                                    //todo update question with answer and open=false
                                    //reply for user
                                    var answer = arr[1]
                                    dataPq.Item.open = {BOOL: false}
                                    dataPq.Item.answer = {S: answer}

                                    //update question
                                    params = {
                                        TableName: 'Telegram_personal_questions',
                                        Item: dataPq.Item
                                    };
                                    ddb.putItem(params, function (err, dataUpd) {
                                        if (err) {
                                            console.log("Error", err);
                                        } else {
                                        }
                                    });

                                    //update status
                                    data.Item.status = {S: "none"}
                                    params = {
                                        TableName: 'Telegram_users',
                                        Item: data.Item
                                    };
                                    ddb.putItem(params, function (err, data) {
                                        if (err) {
                                            console.log("Error", err);
                                        } else {
                                            ctx.reply('Question is answered!')
                                        }
                                    });

                                    //send message to user
                                    ctx.telegram.sendMessage(
                                        dataPq.Item.chatId.S,
                                        answer,
                                        {reply_to_message_id: parseInt(dataPq.Item.messageId.S)}
                                    )
                                } else {
                                    ctx.reply("No question with such id")
                                }
                            });
                        } else {
                            ctx.reply("Wrong format")
                        }

                        break;

                    default:
                        console.log("Bad status");
                }
            }
        });
    }

    // ctx.telegram.sendMessage(ctx.message.chat.id, `Hello ${ctx.state.role}`)
    // ctx.reply(`Hello ${ctx.state.role}`)
})

bot.launch()