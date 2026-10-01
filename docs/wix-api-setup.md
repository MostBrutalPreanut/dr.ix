# הקמת גישת API ל-Wix (הזמנות שולחנות + אירועים)

מטרה: שהאפליקציה תוכל **לקרוא** את ההזמנות להיום (כולל ההערות של הלקוחות) ואת האירועים/כרטיסים, ולהציג אותם לעובדים.
זה שלב 3 בתוכנית, ואפשר להכין את כל זה כבר עכשיו.

> **חשוב:** מפתח API הוא כמו סיסמה למערכת ההזמנות. **לא שולחים אותו בצ'אט, במייל או בוואטסאפ** ולא שומרים בקוד.
> כשנגיע לשלב הזה נשמור אותו כסוד בשרת (Supabase Secrets) ולא בדפדפן של העובדים.

## מי יכול לעשות את זה

רק **בעל החשבון (Owner) או שותף בעלות (Co-owner)** של חשבון ה-Wix. אם הנכס רשום על מישהו אחר, צריך שהוא יעשה את השלבים 1-5.

## שלב 1: ודאו שאתם יודעים באיזו אפליקציה משתמשים

בדשבורד של האתר ב-Wix, בתפריט הצד, חפשו:

- **"Table Reservations"** (הזמנות שולחנות), האפליקציה של הזמנות השולחן.
- **"Events"** (אירועים), האפליקציה של מכירת כרטיסים לאירועים.

(לפי מה שכתבת, אלה שתי האפליקציות שלכם.)

## שלב 2: מצאו את מזהה האתר (Site ID)

פתחו את הדשבורד של האתר. בכתובת הדפדפן תופיע כתובת בצורה:

```
https://manage.wix.com/dashboard/12345678-abcd-....-....-............/home
```

החלק הארוך (מזהה בפורמט GUID) אחרי `/dashboard/` הוא ה-**Site ID**. אפשר לשלוח אותו אליי, הוא לא סודי.

## שלב 3: צרו מפתח API

1. היכנסו לחשבון Wix שמחזיק את האתר (לא רק לדשבורד של האתר) ופתחו את **API Keys** (מנהל מפתחות ה-API). אם אתם לא מוצאים: בהגדרות החשבון חפשו "API Keys".
2. לחצו **Generate API Key** (או **+ Generate API Key** בצד).
3. תנו שם ברור, למשל `drix-os-readonly`.
4. בחרו הרשאות (ראו שלב 4).
5. בחרו **גישה לאתר אחד בלבד**, האתר של דריקס (ולא "כל האתרים בחשבון").
6. לחצו **Generate Key**. Wix תשלח קוד אימות בן 6 ספרות למייל של בעל החשבון, הזינו אותו ולחצו **Verify & Generate Key**.
7. לחצו **Copy Token** ושמרו אותו במקום בטוח. **הוא מוצג פעם אחת בלבד.** אם איבדתם, יוצרים מפתח חדש.

## שלב 4: אילו הרשאות לבחור

אפשר להוסיף הרשאות מאוחר יותר, אבל כדאי לבחור רק את מה שצריך.

| מה אנחנו רוצים | הרשאה | נקודת הקצה שנשתמש בה |
|---|---|---|
| ההזמנות להיום, כולל הערות הלקוח (`teamMessage`) | **Manage Reservations (Medium)**: `SCOPE.DC-RESERVATIONS.MANAGE-RESERVATIONS-MEDIUM` | `POST https://www.wixapis.com/table-reservations/reservations/v1/reservations/query` |
| רשימת אירועים קרובים | **Read Events** | `POST https://www.wixapis.com/events/v3/events/query` |
| מי קנה כרטיסים לאירוע | הרשאות קריאה של Events (הזמנות ואורחים) | `GET https://www.wixapis.com/events/v1/orders` |

שימו לב:

- בהזמנות, אין ב-Wix הרשאת "קריאה בלבד" נפרדת לשולחנות. ההרשאה הנדרשת היא ברמת **Manage** ("ניהול"). האפליקציה שלנו תשתמש **רק בקריאה** ולא תשנה כלום, ולכן המפתח חייב להישאר סודי בשרת.
- ברשימת ההרשאות בדיאלוג של Wix כתוב השם המדויק של כל הרשאה. אם השמות אצלכם שונים במעט ממה שכתוב כאן, שלחו לי צילום מסך של הרשימה ואבחר איתכם את המתאימות.

## שלב 5: בדיקה (אופציונלי, אם אתם נוחים עם טרמינל)

הדבקה בשורת הפקודה (החליפו את שני הערכים):

```bash
curl -X POST 'https://www.wixapis.com/table-reservations/reservations/v1/reservations/query' \
  -H 'Authorization: <ה-API KEY>' \
  -H 'wix-site-id: <ה-SITE ID>' \
  -H 'Content-Type: application/json' \
  -d '{"query":{"cursorPaging":{"limit":5},"sort":[{"fieldName":"details.startDate","order":"DESC"}]}}'
```

תשובה עם רשימת הזמנות (`reservations`) אומרת שהכול עובד. שגיאת `403` או `401` אומרת שחסרה הרשאה או שה-Site ID לא נכון.

## מה האפליקציה תציג

מתוך כל הזמנה: שעה (`details.startDate`), מספר סועדים (`details.partySize`), שם וטלפון (`reservee`), סטטוס (`status`), **הערת הלקוח (`teamMessage`)** ושדות מותאמים (`reservee.customFields`, למשל אלרגיות).
ההזמנות שיש בהן הערה יודגשו במסך "היום", ויופיעו גם כהתראה בראש הדף.

## מה אני צריך ממכם

1. ה-**Site ID** (שלב 2).
2. אישור שאתם משתמשים ב-**Table Reservations** וב-**Events** (שלב 1).
3. כשהמפתח מוכן: **לא לשלוח אותו**. נעשה את זה יחד כשנגיע לשלב 3, ואני אסביר איך להכניס אותו ישירות ל-Supabase Secrets.
4. אם אפשר: צילום מסך של שדות "Additional details" / הערות בהזמנה אחת אמיתית בדשבורד של Wix, כדי שנוודא שהערות הלקוחות באמת נשמרות בשדה `teamMessage` ולא בשדה מותאם.

## מקורות

- [Reservations API (Wix)](https://dev.wix.com/docs/rest/business-solutions/restaurants/wix-restaurants-new/reservations/reservations/introduction)
- [Query Reservations](https://dev.wix.com/docs/rest/business-solutions/restaurants/wix-restaurants-new/reservations/reservations/query-reservations)
- [Authentication Methods: API keys](https://dev.wix.com/docs/overview/auth-permissions/authentication-methods)
- [Query Events](https://dev.wix.com/docs/rest/business-solutions/events/events-v3/query-events)
